import React, { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import Script from "next/script";
import { useConversation } from "@elevenlabs/react";
import { MessageSquare, ClipboardList, Wrench, Mic, RefreshCw, Play, Circle, Plus, ListTodo, Send, CheckCircle2, ChevronUp, Sparkles, X } from "lucide-react";

const AGENT_ID = "agent_7201kjf9ct92ew7t2xjr7fwsbf0f";
const MISTRAL_API_KEY = process.env.NEXT_PUBLIC_MISTRAL_API_KEY || "";
const MISTRAL_MODEL = "mistral-large-latest";

/* ── Mistral helpers ── */
async function mistralChat(messages, tools = null, jsonMode = false) {
  const body = {
    model: MISTRAL_MODEL,
    messages,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    ...(tools ? { tools, tool_choice: "auto" } : {}),
  };
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Mistral API error: ${res.status}`);
  return res.json();
}

/* Tool definitions */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_agent",
      description: "Search the web for information. Use this when the user needs to look up competitors, articles, market data, or any external information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query or research task to perform on the web." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terminal_code_agent",
      description: "Execute code tasks, update files, or run CLI commands (e.g. using Claude Code). Use this when the user wants to update code, scripts, or run terminal commands.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The code or terminal task to perform, described clearly." },
        },
        required: ["task"],
      },
    },
  },
];

/* ── AI Chat Screen Component ── */
function AIChatScreen({ transcript }) {
  const [todoList, setTodoList] = useState([]);
  const [todoLoading, setTodoLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  /* Scroll chat to bottom on new messages */
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /* Generate todo list when component mounts */
  useEffect(() => {
    if (transcript && transcript.length > 0) {
      generateTodoList();
    }
  }, []);

  async function generateTodoList() {
    setTodoLoading(true);
    try {
      const transcriptText = transcript
        .map((m) => `${m.source === "user" ? "User" : "AI"}: ${m.text}`)
        .join("\n");
      const data = await mistralChat(
        [
          {
            role: "system",
            content:
              'You are an assistant that reads meeting transcripts and extracts ONLY actionable tasks that can be executed by one of two tools: web_agent (web searches, research, finding competitors, market data) or terminal_code_agent (updating code, editing files, running scripts, using Claude Code).\n\nRULES:\n- ONLY include tasks that directly map to web_agent OR terminal_code_agent.\n- DO NOT include tasks like scheduling meetings, sending emails, following up, reviewing, planning, or anything that cannot be done by a web search or a code/terminal command.\n- Merge similar tasks (e.g. "find competitors" and "categorize competitors" are ONE web search task).\n- Return at most 3 items. Usually 1-2 is correct.\n- Return ONLY valid JSON in this exact format: { "todos": [ { "step": 1, "action": "...", "priority": "High|Medium|Low", "is_completed": false } ] }',
          },
          {
            role: "user",
            content: `Here is the meeting transcript:\n\n${transcriptText}\n\nExtract all action items into a structured todo list JSON.`,
          },
        ],
        null,
        true
      );
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);
      setTodoList(parsed.todos || []);
    } catch (err) {
      console.error("Todo generation error:", err);
      setTodoList([{ step: 1, action: "Could not generate todos — check console.", is_completed: false }]);
    } finally {
      setTodoLoading(false);
    }
  }

  function toggleTodo(index) {
    setTodoList((prev) =>
      prev.map((t, i) => (i === index ? { ...t, is_completed: !t.is_completed } : t))
    );
  }

  /* Add a todo action to chat and fire it */
  function startTodoItem(item) {
    const msg = item.action;
    addUserMessage(msg);
  }

  function addUserMessage(text) {
    const newMsg = { role: "user", content: text, id: Date.now() };
    setChatMessages((prev) => {
      const updated = [...prev, newMsg];
      runAIChat(updated);
      return updated;
    });
    setChatInput("");
  }

  async function runAIChat(messages) {
    setChatLoading(true);
    try {
      const transcriptText = transcript
        .map((m) => `${m.source === "user" ? "User" : "AI"}: ${m.text}`)
        .join("\n");

      const systemMsg = {
        role: "system",
        content: `You are an intelligent assistant that helps users act on their meeting transcript. You have exactly two tools available and MUST always call one of them when the user asks you to do anything actionable:

- web_agent: call this for ANY task that involves searching, researching, finding information, competitor analysis, market research, or looking things up on the internet.
- terminal_code_agent: call this for ANY task that involves updating code, editing files, running scripts, executing CLI commands, using Claude Code, or making changes to a codebase or website.

IMPORTANT ROUTING RULES:
- "search for competitors" → web_agent
- "find competitors" → web_agent
- "research X" → web_agent
- "update the website code" → terminal_code_agent
- "update the code" → terminal_code_agent
- "use Claude code" → terminal_code_agent
- "run a script" → terminal_code_agent
- Tasks with BOTH research AND code (e.g. "find competitors and update the website") → split into two messages or call web_agent first, then terminal_code_agent.

NEVER respond with just text when a tool call is needed. Always call the appropriate tool.
Do not respond with Markdown. Reply in plain text only.

Meeting transcript context:\n\n${transcriptText}`,
      };

      const apiMessages = [
        systemMsg,
        ...messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .filter((m) => !m.content?.startsWith("❌ Error:"))
          .map(({ role, content }) => ({ role, content })),
      ];
      const data = await mistralChat(apiMessages, TOOLS);
      const choice = data.choices[0];
      const assistantMsg = choice.message;

      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        /* Handle tool calls */
        const call = assistantMsg.tool_calls[0];
        const fnName = call.function.name;
        let fnArgs = {};
        try { fnArgs = JSON.parse(call.function.arguments); } catch {}

        /* Show tool call as a special message */
        setChatMessages((prev) => [
          ...prev,
          {
            role: "tool_call",
            id: Date.now(),
            tool: fnName,
            args: fnArgs,
            content: assistantMsg.content || "",
          },
        ]);

        if (fnName === "terminal_code_agent") {
          /* terminal_code_agent: run orchestrator via Electron IPC */
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", id: Date.now() + 1, content: "⚙️ Running terminal agent…" },
          ]);

          let agentResult = "Terminal agent task completed.";
          if (window.ipc && window.ipc.runTerminalAgent) {
            try {
              agentResult = await window.ipc.runTerminalAgent({ task: fnArgs.task });
            } catch (ipcErr) {
              console.warn("[terminal-agent] IPC error:", ipcErr);
              agentResult = `Terminal agent error: ${ipcErr.message}`;
            }
          }

          // Replace the "Running terminal agent…" message with the real result
          setChatMessages((prev) => {
            const updated = [...prev];
            const runningIdx = updated.findLastIndex(
              (m) => m.content === "⚙️ Running terminal agent…"
            );
            if (runningIdx !== -1) {
              updated[runningIdx] = {
                ...updated[runningIdx],
                content: agentResult,
              };
            }
            return updated;
          });

          // Feed result back to Mistral as a tool message so it can continue
          const toolResultMsg = {
            role: "tool",
            tool_call_id: call.id,
            content: agentResult,
            id: Date.now() + 2,
          };
          setChatMessages((prev) => {
            const next = [...prev, toolResultMsg];
            runAIChat(next);
            return next;
          });
          return; // runAIChat will handle the rest
        } else {
          /* web_agent: run Stagehand via Electron IPC */
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", id: Date.now() + 2, content: "🔍 Searching the web..." },
          ]);

          let searchResult = "Searched the web!";
          if (window.ipc && window.ipc.runWebAgent) {
            try {
              searchResult = await window.ipc.runWebAgent(fnArgs.query);
            } catch (ipcErr) {
              console.warn("[web-agent] IPC error:", ipcErr);
            }
          }

          // Replace the "Searching..." message with the real result
          setChatMessages((prev) => {
            const updated = [...prev];
            const searchingIdx = updated.findLastIndex(
              (m) => m.content === "🔍 Searching the web..."
            );
            if (searchingIdx !== -1) {
              updated[searchingIdx] = {
                ...updated[searchingIdx],
                content: searchResult,
              };
            }
            return updated;
          });
        }
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", id: Date.now(), content: assistantMsg.content },
        ]);
      }
    } catch (err) {
      console.error("AI Chat error:", err);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", id: Date.now(), content: `❌ Error: ${err.message}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function handleChatSubmit(e) {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    addUserMessage(chatInput.trim());
  }

  const priorityColor = { High: "#FD7F03", Medium: "#FE8105", Low: "#FFD900" };

  return (
    <div
      style={{
        display: "flex",
        gap: "20px",
        width: "100%",
        height: "calc(100vh - 80px)",
        padding: "10px",
        boxSizing: "border-box",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* ── Left Panel: AI TODO List ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "rgba(18,18,18,0.9)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "0",
          overflow: "hidden",
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px",
            background: "#1a1a1a",
            borderBottom: "2px solid transparent",
            borderColor: "rgba(253, 127, 3, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontWeight: "bold", fontSize: "14px", color: "#e0e0e0", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
            <ClipboardList size={16} color="#FE8105" />
            AI Action Plan
          </div>
          <button
            onClick={generateTodoList}
            disabled={todoLoading}
            style={{
              background: todoLoading ? "#333" : "rgba(253, 127, 3, 0.2)",
              color: "#fff",
              border: "1px solid rgba(253, 127, 3, 0.4)", backdropFilter: "blur(10px)",
              borderRadius: "0",
              padding: "5px 12px",
              fontSize: "12px",
              cursor: todoLoading ? "not-allowed" : "pointer",
              fontWeight: "bold",
              transition: "all 0.2s",
              boxShadow: todoLoading ? "none" : "none",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <RefreshCw size={14} className={todoLoading ? "ai-spin" : ""} />
            {todoLoading ? "Generating…" : "Regenerate"}
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          {todoLoading ? (
            <div style={{ color: "#888", textAlign: "center", paddingTop: "40px", fontSize: "14px" }}>
              <div style={{ fontSize: "24px", marginBottom: "8px", display: "flex", justifyContent: "center" }}><Sparkles size={24} color="#FD7F03" /></div>
              Analyzing transcript &amp; generating action plan…
            </div>
          ) : todoList.length === 0 ? (
            <div style={{ color: "#555", textAlign: "center", paddingTop: "40px", fontSize: "13px" }}>
              No action items found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {todoList.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px 14px",
                    background: item.is_completed ? "#1a1208" : "#1e1e1e",
                    border: `1px solid ${item.is_completed ? "rgba(253,127,3,0.3)" : "rgba(255,255,255,0.1)"}`,
                    borderRadius: "0",
                    cursor: "pointer",
                    transition: "background 0.2s, border 0.2s",
                  }}
                  onClick={() => toggleTodo(idx)}
                >
                  {/* Checkbox */}
                  <div
                    style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "0",
                      border: `2px solid ${item.is_completed ? "#FD7F03" : "#555"}`,
                      background: item.is_completed ? "#FD7F03" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.2s",
                    }}
                  >
                    {item.is_completed && (
                      <span style={{ color: "#000", fontSize: "11px", fontWeight: "bold" }}>✓</span>
                    )}
                  </div>

                  {/* Step + Action */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          color: "#888",
                          background: "#2a2a2a",
                          padding: "1px 6px",
                          borderRadius: "0",
                          fontFamily: "monospace",
                        }}
                      >
                        #{item.step}
                      </span>
                      {item.priority && (
                        <span
                          style={{
                            fontSize: "10px",
                            color: priorityColor[item.priority] || "#aaa",
                            background: "#1a1a1a",
                            border: `1px solid ${priorityColor[item.priority] || "#444"}`,
                            padding: "1px 6px",
                            borderRadius: "0",
                          }}
                        >
                          {item.priority}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: item.is_completed ? "#888" : "#ddd",
                        lineHeight: 1.4,
                        textDecoration: item.is_completed ? "line-through" : "none",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.action}
                    </div>
                  </div>

                  {/* Start Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startTodoItem(item);
                    }}
                    style={{
                      background: "rgba(253, 127, 3, 0.2)",
                      color: "#fff",
                      border: "1px solid rgba(253, 127, 3, 0.4)", backdropFilter: "blur(10px)",
                      borderRadius: "0",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.2s",
                      boxShadow: "none",
                    }}
                  >
                    <Play size={12} fill="currentColor" />
                    Start
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel: AI Chat ── */}
      <div
        style={{
          width: "380px",
          display: "flex",
          flexDirection: "column",
          background: "rgba(18,18,18,0.9)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "0",
          overflow: "hidden",
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
          flexShrink: 0,
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px",
            background: "#1a1a1a",
            borderBottom: "2px solid transparent",
            borderColor: "rgba(253, 127, 3, 0.3)",
            fontWeight: "bold",
            fontSize: "14px",
            color: "#e0e0e0",
            letterSpacing: "0.5px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <MessageSquare size={16} color="#FE8105" />
          AI Chat
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {chatMessages.length === 0 && (
            <div style={{ color: "#555", fontSize: "13px", textAlign: "center", paddingTop: "20px" }}>
              Ask about the transcript or click &quot;Start&quot; on a task.
            </div>
          )}
          {chatMessages.map((msg, i) => {
            if (msg.role === "tool_call") {
              return (
                <div
                  key={msg.id || i}
                  style={{
                    background: "rgba(30,10,5,0.9)",
                    border: "1px solid rgba(253,127,3,0.3)",
                    borderRadius: "0",
                    padding: "10px 12px",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    color: "#FE8105",
                  }}
                >
                  <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                    🔧 {msg.tool === "web_agent" ? "web_agent" : "terminal_code_agent"}(
                  </div>
                  <div style={{ paddingLeft: "12px", color: "#aaa" }}>
                    {Object.entries(msg.args).map(([k, v]) => (
                      <div key={k}>
                        <span style={{ color: "#FFD900" }}>{k}</span>: "{v}"
                      </div>
                    ))}
                  </div>
                  <div>)</div>
                </div>
              );
            }
            return (
              <div
                key={msg.id || i}
                style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  background: msg.role === "user" ? "#482F1C" : "#2a2a2a",
                  color: "#fff",
                  padding: "10px 14px",
                  borderRadius: "0",
                  maxWidth: "88%",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    opacity: 0.6,
                    marginBottom: "3px",
                    textAlign: msg.role === "user" ? "right" : "left",
                  }}
                >
                  {msg.role === "user" ? "You" : "AI"}
                </div>
                {msg.content}
              </div>
            );
          })}
          {chatLoading && (
            <div
              style={{
                alignSelf: "flex-start",
                background: "#2a2a2a",
                color: "#888",
                padding: "10px 14px",
                borderRadius: "0",
                fontSize: "13px",
              }}
            >
              <span style={{ animation: "pulse 1.2s infinite" }}>⋯ Thinking</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleChatSubmit}
          style={{
            padding: "12px",
            background: "#1a1a1a",
            borderTop: "2px solid transparent",
            borderColor: "rgba(253, 127, 3, 0.3)",
            display: "flex",
            gap: "8px",
          }}
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask AI about the transcript…"
            disabled={chatLoading}
            style={{
              flex: 1,
              background: "#0f0f0f",
              border: "1px solid #333",
              borderRadius: "0",
              padding: "10px 14px",
              color: "#e0e0e0",
              fontSize: "13px",
              outline: "none",
              fontFamily: "Inter, sans-serif",
              backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)",
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
            }}
          />
          <button
            type="submit"
            disabled={chatLoading || !chatInput.trim()}
            style={{
              background: chatLoading || !chatInput.trim() ? "#333" : "rgba(253, 127, 3, 0.2)",
              color: "#fff",
              border: "none",
              borderTop: chatLoading || !chatInput.trim() ? "none" : "1px solid #FE8105",
              borderRadius: "0",
              padding: "10px 16px",
              fontWeight: "bold",
              cursor: chatLoading || !chatInput.trim() ? "not-allowed" : "pointer",
              fontSize: "16px",
              transition: "all 0.2s",
              boxShadow: chatLoading || !chatInput.trim() ? "none" : "none",
            }}
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Demo Controls Component ── */
function DemoControls() {
  const [cameraWindowOpen, setCameraWindowOpen] = useState(false);
  const [blackHoleDetected, setBlackHoleDetected] = useState(null);

  useEffect(() => {
    async function checkBlackHole() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const found = devices.some(
          (d) =>
            d.kind === "audiooutput" &&
            d.label.toLowerCase().includes("blackhole")
        );
        setBlackHoleDetected(found);
      } catch {
        setBlackHoleDetected(false);
      }
    }
    checkBlackHole();
  }, []);

  function handleOpenCameraOutput() {
    if (window.ipc && window.ipc.openCameraOutputWindow) {
      window.ipc.openCameraOutputWindow();
    }
    setCameraWindowOpen(true);
  }

  function handleCloseCameraOutput() {
    if (window.ipc && window.ipc.closeCameraOutputWindow) {
      window.ipc.closeCameraOutputWindow();
    }
    setCameraWindowOpen(false);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
    

      {/* Camera Output Window Toggle & BlackHole Status */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "center" }}>
      
        <div 
          title={
            blackHoleDetected === true
              ? "BlackHole 2ch — detected"
              : blackHoleDetected === false
                ? "BlackHole not found — run: brew install blackhole-2ch"
                : "Checking for BlackHole..."
          }
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          {blackHoleDetected === false ? (
            <X size={16} color="#ff4444" />
          ) : (
            <div
              className={blackHoleDetected === true ? "ai-pulse" : ""}
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: blackHoleDetected === true ? "#00ff88" : "#888",
                animation: blackHoleDetected === true ? "ai-pulse-anim 1.5s infinite" : "none"
              }}
            />
          )}
        </div>

          <button
          onClick={
            cameraWindowOpen ? handleCloseCameraOutput : handleOpenCameraOutput
          }
          className={cameraWindowOpen ? "ai-btn-active" : "ai-btn-inactive"}
          style={{
            minWidth: "200px"
          }}
        >
          {cameraWindowOpen
            ? "■ Close Camera Output"
            : "▶ Launch Camera Output (for OBS)"}
        </button>

      </div>

      {cameraWindowOpen && (
        <div
          style={{
            marginTop: "8px",
            fontSize: "11px",
            color: "#888",
            fontFamily: "monospace",
          }}
        >
          Window "AI Virtual Camera Output" is open → now capture it in OBS
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [aiActive, setAiActive] = useState(false);
  const [currentScreen, setCurrentScreen] = useState(0);
  const [prePrompt, setPrePrompt] = useState("");
  const [prePromptOpen, setPrePromptOpen] = useState(false);
  const [prePromptSent, setPrePromptSent] = useState(false);
  const [transcript, setTranscript] = useState([
    
  // {
  //   "id": 1772250004420,
  //   "source": "ai",
  //   "text": "Hello! I'm ready for our project sync. How can I help you and the team today?"
  // },
  // {
  //   "id": 1772250012129,
  //   "source": "user",
  //   "text": "The team is currently moving forward with the AIDigitalAssistance project. We're looking to refine our positioning for the AI Digital personal assistance market."
  // },
  // {
  //   "id": 1772250012359,
  //   "source": "ai",
  //   "text": "That sounds like a solid plan. AIDigitalAssistance has a lot of potential. What is the first priority for this phase?"
  // },
  // {
  //   "id": 1772250025526,
  //   "source": "user",
  //   "text": "We need to get a comprehensive list of our main competitors. Once we have that, we're going to use the data to update the company website and integrate them into our comparison section update the code with claude code."
  // },
  // {
  //   "id": 1772250025945,
  //   "source": "ai",
  //   "text": "I can certainly help compile that list. I'll focus on other AI personal assistants to ensure the website update is data-driven. Should I categorize them by feature set or pricing?"
  // },
  // {
  //   "id": 1772250046147,
  //   "source": "user",
  //   "text": "Both would be great. I've got to jump into another session now, but let's touch base and talk more about this in a couple of days."
  // },
  // {
  //   "id": 1772250046154,
  //   "source": "ai",
  //   "text": "Understood. I'll have that competitor analysis ready for you by then. Speak to you in a couple of days!"
  // }

  ]);
  const transcriptEndRef = useRef(null);
  const transcriptChannelRef = useRef(null);

  useEffect(() => {
    console.log("Transcript:", transcript);
  }, [transcript]);

  const handleNewMessage = useCallback((source, text) => {
    setTranscript(prev => {
      if (prev.length === 0) return [{ id: Date.now(), source, text }];
      const lastMsg = prev[prev.length - 1];
      if (lastMsg.source !== source) return [...prev, { id: Date.now(), source, text }];
      const newCtx = [...prev];
      newCtx[newCtx.length - 1].text = text;
      return newCtx;
    });
  }, []);

  const handleAiStart = useCallback(() => {
    setTranscript(prev => {
      if (prev.length > 0 && prev[prev.length - 1].source === 'ai' && prev[prev.length - 1].text === '') {
         return prev;
      }
      return [...prev, { id: Date.now(), source: 'ai', text: '' }];
    });
  }, []);

  useEffect(() => {
    transcriptChannelRef.current = new BroadcastChannel('transcript_channel');
    transcriptChannelRef.current.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'message') {
        console.log(`[Live Transcript][${data.source}]:`, data.text); // Debugging
        handleNewMessage(data.source, data.text);
      } else if (data.type === 'ai_start') {
        handleAiStart();
      }
    };
    return () => transcriptChannelRef.current.close();
  }, [handleNewMessage, handleAiStart]);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  useEffect(() => {
    window.setCurrentScreen = setCurrentScreen;
    // Auto-advance logic for React side will be handled mostly by main.js
    // but we can check here if we have saved data
    const savedDataStr = localStorage.getItem("savedFaceData");
    const savedImage = localStorage.getItem("savedFaceOriginal");
    
    if (savedDataStr) {
      setCurrentScreen(3);
    } else if (savedImage) {
      setCurrentScreen(1);
    }
  }, []);
  const lastTranscriptRef = useRef("");
  const isThinkingRef = useRef(false);

  const conversation = useConversation({
    clientTools: {
      add_knowledge: async ({ text }) => {
        console.log('[add_knowledge] Storing:', text?.slice(0, 80));
        isThinkingRef.current = true;
        try {
          const result = await window.ipc.invoke('add-knowledge', text);
          return result?.message || 'Knowledge stored.';
        } catch (err) {
          console.error('[add_knowledge] Error:', err);
          return 'Failed to store knowledge.';
        } finally {
          isThinkingRef.current = false;
        }
      },

      retrieve_knowledge: async ({ query, topK }) => {
        console.log('[retrieve_knowledge] Query:', query);
        isThinkingRef.current = true;
        try {
          const results = await window.ipc.invoke('retrieve-knowledge', query, topK || 3);
          if (!results || results.length === 0) return 'No relevant knowledge found.';
          return results.map((r, i) => `[${i + 1}] ${r.text}`).join('\n\n');
        } catch (err) {
          console.error('[retrieve_knowledge] Error:', err);
          return 'Failed to retrieve knowledge.';
        } finally {
          isThinkingRef.current = false;
        }
      },

      no_knowledge: async ({ query }) => {
        console.log('[no_knowledge] Ping! Sending query to user because LLM could not answer:', query);
        return "Pinged the user successfully. Please wait for the user to respond.";
      }
    },
    onConnect: () => {
      console.log("[ElevenLabs] Connected");
      if (window.aiAnimStartBlink) window.aiAnimStartBlink();
    },
    onDisconnect: () => {
      console.log("[ElevenLabs] Disconnected");
      if (window.aiAnimStopSpeaking) window.aiAnimStopSpeaking();
      if (window.aiAnimStopBlink) window.aiAnimStopBlink();
      setAiActive(false);
    },
    onMessage: (message) => {
      const text = message.message || message.text || "";
      if (transcriptChannelRef.current) {
        transcriptChannelRef.current.postMessage({ type: 'message', source: message.source, text: text });
      }
      console.log(`[Live Transcript][Local ${message.source}]:`, text); // Debugging
      handleNewMessage(message.source, text);

      if (message.source === "ai") {
        if (text) {
          /* Extract only the NEW portion of incremental text */
          const prev = lastTranscriptRef.current || "";
          let newText = text;
          if (text.startsWith(prev) && text.length > prev.length) {
            newText = text.slice(prev.length);
          } else if (text === prev) {
            return; /* exact duplicate, skip */
          }
          lastTranscriptRef.current = text;
          if (window.aiAnimMouthText) window.aiAnimMouthText(newText);
        }
      }
    },
    onError: (error) => {
      console.error("[ElevenLabs Error]:", error);
    },
  });

  /* Drive mouth open/close based on isSpeaking */
  const prevSpeakingRef = useRef(false);
  useEffect(() => {
    if (conversation.isSpeaking && !prevSpeakingRef.current) {
      /* Agent started speaking */
      lastTranscriptRef.current = ""; /* reset for new utterance */
      if (window.aiAnimStartSpeaking) window.aiAnimStartSpeaking();
      handleAiStart();
      if (transcriptChannelRef.current) {
        transcriptChannelRef.current.postMessage({ type: 'ai_start' });
      }
    } else if (!conversation.isSpeaking && prevSpeakingRef.current) {
      /* Agent stopped speaking */
      lastTranscriptRef.current = "";
      if (window.aiAnimStopSpeaking) window.aiAnimStopSpeaking();
    }
    prevSpeakingRef.current = conversation.isSpeaking;
  }, [conversation.isSpeaking]);

  const toggleConversation = useCallback(async () => {
    if (conversation.status === "connected") {
      await conversation.endSession();
      if (window.aiAnimStopSpeaking) window.aiAnimStopSpeaking();
      setAiActive(false);
    } else {
      try {
        await conversation.startSession({ agentId: AGENT_ID });
        setAiActive(true);
        if (window.aiAnimStartBlink) window.aiAnimStartBlink();
        // Send pre-prompt as contextual update if set
        if (prePrompt.trim()) {
          try {
            conversation.sendContextualUpdate(prePrompt.trim());
            console.log("[PrePrompt] Sent contextual update:", prePrompt.trim().slice(0, 80));
          } catch (e) {
            console.warn("[PrePrompt] Failed to send contextual update:", e);
          }
        }
      } catch (err) {
        console.error("Failed to start ElevenLabs session", err);
      }
    }
  }, [conversation, prePrompt]);
  return (
    <React.Fragment>
      <Head>
        <title>3D Face - 2.5D Photo Portrait</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="/style.css" />
      </Head>

      {/* ── Restart Button ── */}
      <div 
        style={{
          position: "fixed",
          top: "10px",
          right: "10px",
          zIndex: 9999
        }}
      >
        <button
          onClick={() => {
            localStorage.removeItem("savedFaceOriginal");
            localStorage.removeItem("savedFaceData");
            window.location.reload();
          }}
          style={{
            background: "rgba(253, 127, 3, 0.2)",
            color: "white",
            border: "1px solid rgba(253, 127, 3, 0.4)", backdropFilter: "blur(10px)",
            padding: "8px 16px",
            borderRadius: "0",
            cursor: "pointer",
            fontWeight: "bold",
            boxShadow: "none"
          }}
          title="Clear saved data and start over"
        >
          Restart
        </button>
      </div>
      {/* ── Screen Navigation ── */}
      <div className="screen-nav">
        <button
          onClick={() => setCurrentScreen((prev) => Math.max(0, prev - 1))}
          disabled={currentScreen === 0}
        >
          &lt;
        </button>
        <button
          onClick={() => setCurrentScreen((prev) => Math.min(4, prev + 1))}
          disabled={currentScreen === 4}
        >
          &gt;
        </button>
      </div>

      <div id="top-right-controls" className="screen-nav-right" style={{ display: currentScreen === 3 ? undefined : "none" }}>
  <span
    id="play"
    onClick={() => {
      if (window.onPlay) window.onPlay();
    }}
    style={{ cursor: "pointer" }}
    title="Auto-rotate"
  >
    &#x25B6;
  </span>
  <span
    id="pause"
    onClick={() => {
      if (window.onPause) window.onPause();
    }}
    style={{ display: "none", cursor: "pointer" }}
    title="Pause"
  >
    &#x23F8;
  </span>
  <span
    onClick={() => {
      if (window.aiToggleControls) window.aiToggleControls();
    }}
    style={{
      cursor: "pointer",
      fontSize: "20px",
      verticalAlign: "middle",
      marginLeft: "8px",
      opacity: 0.7,
    }}
    title="Toggle expression controls"
  >
    &#x2699;
  </span>
</div>
<div className="main-content app-container" data-screen={currentScreen}>
        {/* ═══════════════════════════════════════════════
            PHASE 0: START / UPLOAD
            ═══════════════════════════════════════════════ */}
        <div id="face0">
          <div id="startface">
            <h2 style={{ color: "#FD7F03", marginBottom: "4px", textTransform: "none" }}>
              Create a 3D Face for your ShadowMistral
            </h2>
            <p style={{ color: "#888", marginBottom: "20px" }}>
              Upload a front-facing portrait photo to begin.
            </p>
          </div>

          <div className="drop-zone" id="dropzone">
            <div className="icon" style={{ display: "flex", justifyContent: "center" }}><Plus size={48} /></div>
            <p>
              <strong>Drop Image Here</strong>
            </p>
            <p>or click to select</p>
            <input
              type="file"
              id="file"
              accept="image/*"
              style={{ display: "none" }}
            />
          </div>

          <p style={{ textAlign: "center", color: "#666", fontSize: "12px", marginTop: "16px" }}>
            Supports JPG, PNG &bull; Best results with front-facing portraits.
          </p>
        </div>

        {/* ═══════════════════════════════════════════════
            PHASE 1: IMAGE LOADED — ROTATE / FIND FACE
            ═══════════════════════════════════════════════ */}
        <div id="face1">
          <div id="facemenu">
            <button
              onClick={() => {
                if (window.onRotate) window.onRotate();
              }}
              title="Rotate image 90°"
            >
              Rotate
            </button>
            <button
              id="findface"
              onClick={() => {
                if (window.onStartDetect) window.onStartDetect();
                setCurrentScreen(2); setCurrentScreen(2);
              }}
            >
              Find Face
            </button>
            <button
              onClick={() => {
                if (window.onManualSelect) window.onManualSelect();
                setCurrentScreen(2); setCurrentScreen(2);
              }}
            >
              Manual Select
            </button>
            <button
              onClick={() => {
                if (window.onFaceCancel) window.onFaceCancel();
              }}
            >
              New Face
            </button>
            {/* {/* <div id="facem">...</div> */}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════
            SHARED CANVAS AREA (contour editing / detection)
            ═══════════════════════════════════════════════ */}
        <div id="contour">
          <canvas id="canvas" width="648" height="648"></canvas>
          <canvas id="ovcanvas" width="648" height="648"></canvas>
        </div>

        {/* ═══════════════════════════════════════════════
            PHASE 2: DETECTION IN PROGRESS
            ═══════════════════════════════════════════════ */}
        <div id="face2">
          <div className="loading-msg">
            <span className="spinner"></span> Detecting face landmarks&hellip;
          </div>
        </div>

        {/* ═══════════════════════════════════════════════
            PHASE 3: DETECTION FALLBACK / FAILED
            ═══════════════════════════════════════════════ */}
        <div id="face3">
          <div style={{ textAlign: "center", padding: "20px" }}>
            <p style={{ color: "#ffd700" }}>
              &#x26A0; Face detection could not reliably find a face.
            </p>
            <p style={{ color: "#888", fontSize: "13px" }}>
              You can try a different photo or use Manual Select.
            </p>
            <button
              onClick={() => {
                if (window.onFaceCancel) window.onFaceCancel();
              }}
              style={{ marginTop: "10px" }}
            >
              &#x2190; Try Another Photo
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════
            PHASE 4: CONTOUR EDITING + 3D RENDERING
            ═══════════════════════════════════════════════ */}
        <div id="face4">
          {/* ── 2D Contour Editing ── */}
          <div id="face2d">
            <div style={{ padding: "4px 0" }}>
              <span
                id="mousehint"
                style={{ fontSize: "12px", color: "#aaa" }}
              ></span>
            </div>
            <div style={{ margin: "6px 0" }}>
              <button
                onClick={() => {
                  if (window.on3dFace) window.on3dFace();
                  setCurrentScreen(3); setCurrentScreen(3);
                }}
                style={{
                  background: "rgba(253, 127, 3, 0.2)",
                  padding: "8px 20px",
                  fontSize: "14px",
                  border: "1px solid rgba(253, 127, 3, 0.4)", backdropFilter: "blur(10px)",
                  boxShadow: "none",
                }}
              >
                Next Step
              </button>
              <button
                onClick={() => {
                  if (window.onManualSelect0) window.onManualSelect0();
                }}
                style={{ fontSize: "12px" }}
              >
                &#9998; Re-edit Points
              </button>
              <button
                onClick={() => {
                  if (window.onFaceCancel) window.onFaceCancel();
                }}
                style={{ fontSize: "12px" }}
              >
                New Face
              </button>
            </div>
          </div>

          {/* ── 3D Rendering View ── */}
          <div id="face3d">
            <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", width: "100%", height: "100%", boxSizing: "border-box", padding: "10px" }}>
            
            {/* Left Column */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ marginBottom: "6px" }}></div>

              <div id="glcontainer">
                <canvas id="canvas3d" width="1150" height="1150" style={{ cursor: "move" }}></canvas>
              </div>

            <div id="controlblock">
              {/* Expressions */}
              <div className="btn-group">
                <h4>Expressions</h4>
                <canvas
                  id="bsmile"
                  width="24"
                  height="24"
                  title="Smile"
                ></canvas>
                <canvas
                  id="bsurprised"
                  width="24"
                  height="24"
                  title="Surprised"
                ></canvas>
                <canvas id="bsad" width="24" height="24" title="Sad"></canvas>
                <canvas
                  id="bangry"
                  width="24"
                  height="24"
                  title="Angry"
                ></canvas>
                <canvas
                  id="btalking"
                  width="24"
                  height="24"
                  title="Talking"
                ></canvas>
              </div>

              {/* Eye Effects */}
              <div className="btn-group">
                <h4>Eyes</h4>
                <canvas
                  id="bblink"
                  width="24"
                  height="24"
                  title="Blink"
                ></canvas>
                <canvas id="bwink" width="24" height="24" title="Wink"></canvas>
              </div>

              {/* Eye Movement */}
              <div className="btn-group">
                <h4>Eye Movement</h4>
                <canvas
                  id="bsquint"
                  width="24"
                  height="24"
                  title="Squint"
                ></canvas>
                <canvas
                  id="btennis"
                  width="24"
                  height="24"
                  title="Follow Head"
                ></canvas>
              </div>

              {/* Looks */}
              <div className="btn-group">
                <h4>Looks</h4>
                <canvas
                  id="bstatue"
                  width="24"
                  height="24"
                  title="Statue"
                ></canvas>
                <canvas
                  id="balien"
                  width="24"
                  height="24"
                  title="Alien"
                ></canvas>
                <canvas id="btoon" width="24" height="24" title="Toon"></canvas>
                <canvas
                  id="bterminator"
                  width="24"
                  height="24"
                  title="Terminator"
                ></canvas>
              </div>

              {/* Song / Animation */}
              <div className="song-controls">
                <h4
                  style={{
                    margin: "4px 0",
                    fontSize: "12px",
                    color: "#888",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Animation
                </h4>
                <select
                  id="songselect"
                  onChange={(e) => {
                    if (window.onSong) window.onSong(e.currentTarget);
                  }}
                >
                  <option value="">- Select Animation -</option>
                  <option value="demo">Demo Dance</option>
                </select>
                <span id="ajaxsong">
                  Loading song... <span id="songprogress"></span>
                </span>
                <span id="playbutton" style={{ display: "none" }}>
                  <button
                    onClick={() => {
                      if (window.onSongPlay) window.onSongPlay();
                    }}
                  >
                    &#x25B6; Play Song
                  </button>
                </span>
              </div>

              {/* Toolbar */}
              <div className="toolbar">
                <canvas
                  id="bpublish"
                  width="24"
                  height="24"
                  title="Publish"
                ></canvas>
                <canvas
                  id="bsnapshot"
                  width="24"
                  height="24"
                  title="Snapshot"
                ></canvas>
              </div>

              {/* Snapshot Preview */}
              <div style={{ marginTop: "8px" }}>
                <a
                  id="snapshota"
                  download="3dface.png"
                  style={{ display: "none" }}
                >
                  <canvas
                    id="snapshot"
                    width="128"
                    height="128"
                    style={{ border: "1px solid #333", borderRadius: "4px" }}
                  ></canvas>
                </a>
              </div>
            </div>
            {/* /controlblock */}

            {/* ── Action Rows (Speak / Demo) ── */}
            <div style={{ 
              display: "flex", 
              alignItems: "flex-end", 
              justifyContent: "space-between",
              gap: "24px", 
              marginTop: "16px",
              padding: "12px",
              background: "rgba(18,18,18,0.9)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderTop: "2px solid transparent",
              borderColor: "rgba(253, 127, 3, 0.3)",
              borderRadius: "0",
              width: "100%",
              backdropFilter: "blur(12px)",
            }}>
              {/* ── Speak to AI Button + Pre-Prompt ── */}
              <div id="speak-to-ai-container" style={{ margin: 0, padding: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    id="speak-to-ai-btn"
                    className={aiActive ? "ai-btn-active" : "ai-btn-inactive"}
                    onClick={toggleConversation}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      textTransform: "none",
                    }}
                  >
                    {conversation.status === "connected"
                      ? conversation.isSpeaking
                        ? <><MessageSquare size={18} /> AI is speaking...</>
                        : <><Mic size={18} /> Listening... (Click to stop)</>
                      : <><Mic size={18} /> Speak to AI</>}
                  </button>
                  <button
                    id="pre-prompt-toggle-btn"
                    onClick={() => { setPrePromptOpen(prev => !prev); setPrePromptSent(false); }}
                    title="Add temporary context for the AI"
                    style={{
                      background: "transparent",
                      color: "#fff",
                      // width: "40px",
                      // height: "40px",
                      fontSize: "14px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.2s",
                      transform: prePromptOpen ? "rotate(45deg)" : "none",
                      flexShrink: 0,
                      padding: "0",
                      marginLeft: "10px",
                      border: "none",
                      // boxShadow: prePromptOpen ? "none" : "none",
                    }}
                  >
                    <Plus size={20} />
                  </button>
                  {prePrompt.trim() && (
                    <span style={{ fontSize: "10px", color: "#FD7F03", opacity: 0.8 }} title="Pre-prompt is set">
                      <Circle size={8} fill="currentColor" style={{ display: 'inline', marginRight: '4px' }} />
                      Context Set
                    </span>
                  )}
                </div>
                {conversation.status === "connected" && (
                  <div className="ai-status-indicator">
                    <span className="ai-pulse"></span>
                    {conversation.isSpeaking ? "Agent speaking" : "Listening"}
                  </div>
                )}

                {/* ── Pre-Prompt Panel ── */}
                {prePromptOpen && (
                  <div style={{
                    marginTop: "12px",
                    padding: "12px",
                    background: "#0f0f0f",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0",
                    animation: "fadeIn 0.2s ease",
                  }}>
                    <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>
                      Temporary context for this session only — gone on restart
                    </div>
                    <textarea
                      id="pre-prompt-textarea"
                      value={prePrompt}
                      onChange={(e) => { setPrePrompt(e.target.value); setPrePromptSent(false); }}
                      placeholder='e.g. "I am still facing a blocker on the project" or "The deadline moved to Friday"'
                      rows={3}
                      style={{
                        width: "100%",
                        background: "#1a1a1a",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: "0",
                        padding: "8px 10px",
                        color: "#e0e0e0",
                        fontSize: "12px",
                        fontFamily: "Inter, sans-serif",
                        resize: "vertical",
                        outline: "none",
                        boxSizing: "border-box",
                        backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)",
                        boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
                      }}
                    />
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                      <button
                        id="pre-prompt-send-btn"
                        disabled={!prePrompt.trim()}
                        onClick={() => {
                          if (conversation.status === "connected" && prePrompt.trim()) {
                            try {
                              conversation.sendContextualUpdate(prePrompt.trim());
                              setPrePromptSent(true);
                              console.log("[PrePrompt] Sent mid-session update:", prePrompt.trim().slice(0, 80));
                            } catch (e) {
                              console.warn("[PrePrompt] Failed:", e);
                            }
                          } else {
                            setPrePromptSent(true);
                          }
                        }}
                        style={{
                          background: !prePrompt.trim() ? "#333" : "rgba(253, 127, 3, 0.2)",
                          color: "#fff",
                          border: "none",
                          borderTop: !prePrompt.trim() ? "none" : "1px solid #FE8105",
                          borderRadius: "0",
                          padding: "6px 14px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          cursor: !prePrompt.trim() ? "not-allowed" : "pointer",
                          transition: "all 0.2s",
                          boxShadow: !prePrompt.trim() ? "none" : "none",
                        }}
                      >
                        {conversation.status === "connected" ? "Send Now" : "Save"}
                      </button>
                      <button
                        onClick={() => { setPrePrompt(""); setPrePromptSent(false); }}
                        style={{
                          background: "transparent",
                          color: "#888",
                          border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: "0",
                          padding: "6px 10px",
                          fontSize: "11px",
                          cursor: "pointer",
                          boxShadow: "none",
                        }}
                      >
                        Clear
                      </button>
                      {prePromptSent && (
                        <span style={{ fontSize: "11px", color: "#FE8105" }}>
                          {conversation.status === "connected" ? "✓ Sent to AI" : "✓ Saved — will be sent when you start speaking"}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Demo Controls: OBS Virtual Camera ── */}
              <DemoControls />
            </div>
            </div>

            {/* Right Column: Live Transcript */}
            <div id="live-transcript-container" style={{
              width: "350px",
              height: "calc(100vh - 100px)",
              background: "rgba(18,18,18,0.9)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              overflow: "hidden",
              backdropFilter: "blur(12px)",
            }}>
               <div style={{ padding: "12px", background: "#1a1a1a", borderBottom: "2px solid transparent", borderColor: "rgba(253, 127, 3, 0.3)", fontWeight: "bold", fontSize: "14px", color: "#e0e0e0", display: "flex", alignItems: "center", gap: "8px" }}>
                 <ClipboardList size={16} color="#FE8105" />
                 Live Transcript
               </div>
               
               <div style={{ flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
                 {transcript.map((msg, i) => (
                   <div key={msg.id || i} style={{
                     alignSelf: msg.source === 'user' ? 'flex-end' : 'flex-start',
                     background: msg.source === 'user' ? '#482F1C' : '#2a2a2a',
                     color: '#fff',
                     padding: '8px 12px',
                     borderRadius: '0',
                     maxWidth: '85%',
                     fontSize: '13px',
                     lineHeight: '1.4'
                   }}>
                     <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '2px', textAlign: msg.source === 'user' ? 'right' : 'left' }}>
                       {msg.source === 'user' ? 'MEETING' : 'AI'}
                     </div>
                     <div>{msg.text}</div>
                   </div>
                 ))}
                 <div ref={transcriptEndRef} />
               </div>

               <div style={{ padding: "16px", background: "#1a1a1a", borderTop: "2px solid transparent", borderImage: "linear-gradient(to right, #FD7F03, #FE8105, transparent) 1" }}>
                 <button
                   onClick={() => setCurrentScreen(4)}
                   style={{
                     width: "100%",
                     padding: "10px",
                     background: "rgba(253, 127, 3, 0.2)",
                     color: "#fff",
                     border: "1px solid rgba(253, 127, 3, 0.4)", backdropFilter: "blur(10px)",
                     borderRadius: "0",
                     fontWeight: "bold",
                     cursor: "pointer",
                     fontSize: "14px",
                     transition: "all 0.2s",
                     boxShadow: "none",
                     display: "flex",
                     alignItems: "center",
                     justifyContent: "center",
                     gap: "8px"
                   }}
                 >
                   <MessageSquare size={16} />
                   Open AI Chat
                 </button>
               </div>
            </div>
            {/* /live-transcript-container */}

            </div>
          </div>
          {/* /face3d */}
        </div>
        {/* /face4 */}
      </div>

      {/* ═══════════════════════════════════════════════
          SCREEN 4: AI CHAT + TODO LIST
          ═══════════════════════════════════════════════ */}
      {currentScreen === 4 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#0a0a0a",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            padding: "50px 20px 20px",
            boxSizing: "border-box",
          }}
        >
          <AIChatScreen transcript={transcript} />
        </div>
      )}
      {/* /main-content */}

      {/* ═══════════════════════════════════════════════
          HIDDEN UTILITY ELEMENTS
          ═══════════════════════════════════════════════ */}
      <canvas
        id="work"
        width="1024"
        height="1024"
        style={{ display: "none" }}
      ></canvas>
      <canvas
        id="texcanvas"
        width="512"
        height="512"
        style={{ display: "none" }}
      ></canvas>
      <canvas
        id="vigcanvas"
        width="240"
        height="180"
        style={{ display: "none" }}
      ></canvas>
      <audio id="audio" preload="none"></audio>

      <Script src="/jszip.js" strategy="beforeInteractive" />
      <Script src="/tools.js" strategy="beforeInteractive" />
      <Script src="/photoanim.js" strategy="beforeInteractive" />
      <Script src="/fd.js" strategy="afterInteractive" />
      <Script src="/facemodel.js" strategy="afterInteractive" />
      <Script src="/main.js" strategy="afterInteractive" />
    </React.Fragment>
  );
}
