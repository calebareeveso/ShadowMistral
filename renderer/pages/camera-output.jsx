import React, { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import Script from "next/script";
import { useConversation } from "@elevenlabs/react";
import { useBlackHoleRouter } from "../lib/blackhole-audio-router";

const AGENT_ID = "agent_7201kjf9ct92ew7t2xjr7fwsbf0f";

export default function CameraOutput() {
  const [aiActive, setAiActive] = useState(false);
  const lastTranscriptRef = useRef("");
  const transcriptChannelRef = useRef(null);
  const { isBlackHoleActive, redirectAudioToBlackHole } = useBlackHoleRouter();

  useEffect(() => {
    transcriptChannelRef.current = new BroadcastChannel('transcript_channel');
    return () => transcriptChannelRef.current.close();
  }, []);

  const isThinkingRef = useRef(false);

  const conversation = useConversation({
    clientTools: {
      add_knowledge: async ({ text }) => {
        console.log('[CameraOutput][add_knowledge] Storing:', text?.slice(0, 80));
        isThinkingRef.current = true;
        try {
          const result = await window.ipc.invoke('add-knowledge', text);
          return result?.message || 'Knowledge stored.';
        } catch (err) {
          console.error('[CameraOutput][add_knowledge] Error:', err);
          return 'Failed to store knowledge.';
        } finally {
          isThinkingRef.current = false;
        }
      },

      retrieve_knowledge: async ({ query, topK }) => {
        console.log('[CameraOutput][retrieve_knowledge] Query:', query);
        isThinkingRef.current = true;
        try {
          const results = await window.ipc.invoke('retrieve-knowledge', query, topK || 3);
          if (!results || results.length === 0) return 'No relevant knowledge found.';
          return results.map((r, i) => `[${i + 1}] ${r.text}`).join('\n\n');
        } catch (err) {
          console.error('[CameraOutput][retrieve_knowledge] Error:', err);
          return 'Failed to retrieve knowledge.';
        } finally {
          isThinkingRef.current = false;
        }
      },

      no_knowledge: async ({ query }) => {
        console.log('[CameraOutput][no_knowledge] Ping! Query:', query);
        return "Pinged the user successfully. Please wait for the user to respond.";
      }
    },
    onConnect: async () => {
      console.log("[CameraOutput][ElevenLabs] Connected");
      if (window.aiAnimStartBlink) window.aiAnimStartBlink();
      // Redirect audio to BlackHole after connection
      try {
        await redirectAudioToBlackHole();
        console.log("[CameraOutput] BlackHole audio redirect applied");
      } catch (err) {
        console.warn("[CameraOutput] BlackHole redirect failed:", err);
      }
    },
    onDisconnect: () => {
      console.log("[CameraOutput][ElevenLabs] Disconnected");
      if (window.aiAnimStopSpeaking) window.aiAnimStopSpeaking();
      if (window.aiAnimStopBlink) window.aiAnimStopBlink();
      setAiActive(false);
    },
    onMessage: (message) => {
      const text = message.message || message.text || "";
      if (transcriptChannelRef.current) {
        transcriptChannelRef.current.postMessage({
          type: 'message',
          source: message.source,
          text: text
        });
      }

      if (message.source === "ai") {
        if (text) {
          const prev = lastTranscriptRef.current || "";
          let newText = text;
          if (text.startsWith(prev) && text.length > prev.length) {
            newText = text.slice(prev.length);
          } else if (text === prev) {
            return;
          }
          lastTranscriptRef.current = text;
          if (window.aiAnimMouthText) window.aiAnimMouthText(newText);
        }
      }
    },
    onError: (error) => {
      console.error("[CameraOutput][ElevenLabs Error]:", error);
    },
  });

  /* Drive mouth open/close based on isSpeaking */
  const prevSpeakingRef = useRef(false);
  useEffect(() => {
    if (conversation.isSpeaking && !prevSpeakingRef.current) {
      lastTranscriptRef.current = "";
      if (window.aiAnimStartSpeaking) window.aiAnimStartSpeaking();
      if (transcriptChannelRef.current) {
        transcriptChannelRef.current.postMessage({ type: 'ai_start' });
      }
    } else if (!conversation.isSpeaking && prevSpeakingRef.current) {
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
      } catch (err) {
        console.error("Failed to start ElevenLabs session", err);
      }
    }
  }, [conversation]);

  /* Auto-advance to screen 3 for camera output since face is pre-generated */
  useEffect(() => {
    window.setCurrentScreen = () => {}; // no-op — camera output doesn't use screen nav
  }, []);

  return (
    <React.Fragment>
      <Head>
        <title>AI Virtual Camera Output</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="/style.css" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: 1280px;
            height: 920px;
            overflow: hidden;
            background: #000;
          }
          /* Override style.css layout for camera output */
          .main-content {
            width: 1280px !important;
            height: 1020px !important;
            max-width: none !important;
            overflow: hidden !important;
            background: #000 !important;
            padding: 0 !important;
            margin: 0 !important;
            position: relative !important;
          }
          #face4 {
            width: 1540px !important;
            height: 920px !important;
            position: relative !important;
            overflow: hidden !important;
          }
          #face3d {
            width: 1280px !important;
            height: 920px !important;
            position: relative !important;
            display: block !important;
            overflow: hidden !important;
          }
          #glcontainer {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            max-width: none !important;
            width: 1280px !important;
            height: 1280px !important;
            margin: 0 !important;
            border: none !important;
            background: #000 !important;
            overflow: hidden !important;
          }
          #canvas3d {
            display: block !important;
            width: 1280px !important;
            height: 1280px !important;
          }
        `}</style>
      </Head>

      {/* Minimal floating controls for the camera output window */}
      <div style={{
        position: "fixed",
        bottom: "12px",
        left: "12px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }}>
        {/* Start/Stop AI button — small and unobtrusive */}
        <button
          onClick={toggleConversation}
          style={{
            padding: "4px 10px",
            background: aiActive ? "#ff4444" : "#00aa55",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "11px",
            fontFamily: "monospace",
            opacity: 0.7
          }}
        >
          {conversation.status === "connected"
            ? conversation.isSpeaking
              ? "Speaking..."
              : "■ Stop"
            : "▶ Start AI"}
        </button>
      </div>

      {/* BlackHole status dot */}
      <div style={{
        position: "fixed",
        bottom: "12px",
        right: "12px",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: isBlackHoleActive ? "#00ff88" : "#ff4444",
        opacity: 0.6,
        zIndex: 9999
      }} />

      {/* ═══════════════════════════════════════════════
          DOM STRUCTURE — mirrors home.jsx so main.js can find elements
          ═══════════════════════════════════════════════ */}
      <div className="main-content app-container" data-screen={3}>
        {/* PHASE 0: hidden */}
        <div id="face0" style={{ display: "none" }}>
          <div id="startface"></div>
          <div className="drop-zone" id="dropzone">
            <input type="file" id="file" accept="image/*" style={{ display: "none" }} />
          </div>
        </div>

        {/* PHASE 1: hidden */}
        <div id="face1" style={{ display: "none" }}>
          <div id="facemenu">
            <button id="findface">Find Face</button>
          </div>
        </div>

        {/* Shared canvas area (detection) — hidden but present for main.js */}
        <div id="contour" style={{ display: "none" }}>
          <canvas id="canvas" width="648" height="648"></canvas>
          <canvas id="ovcanvas" width="648" height="648"></canvas>
        </div>

        {/* PHASE 2: hidden */}
        <div id="face2" style={{ display: "none" }}></div>
        {/* PHASE 3: hidden */}
        <div id="face3" style={{ display: "none" }}></div>

        {/* PHASE 4: 3D Rendering — THE VISIBLE PART */}
        <div id="face4" style={{ display: "inline" }}>
          <div id="face2d" style={{ display: "none" }}>
            <span id="mousehint"></span>
          </div>
          <div id="face3d" style={{ display: "block" }}>
            <div id="glcontainer">
              <canvas id="canvas3d" width="1150" height="1150" style={{ cursor: "default" }}></canvas>
            </div>
            <div id="controlblock" style={{ display: "none" }}>
              {/* Expression button canvases — hidden but needed by main.js Button() constructor */}
              <canvas id="bsmile" width="24" height="24"></canvas>
              <canvas id="bsurprised" width="24" height="24"></canvas>
              <canvas id="bsad" width="24" height="24"></canvas>
              <canvas id="bangry" width="24" height="24"></canvas>
              <canvas id="btalking" width="24" height="24"></canvas>
              <canvas id="bblink" width="24" height="24"></canvas>
              <canvas id="bwink" width="24" height="24"></canvas>
              <canvas id="bsquint" width="24" height="24"></canvas>
              <canvas id="btennis" width="24" height="24"></canvas>
              <canvas id="bstatue" width="24" height="24"></canvas>
              <canvas id="balien" width="24" height="24"></canvas>
              <canvas id="btoon" width="24" height="24"></canvas>
              <canvas id="bterminator" width="24" height="24"></canvas>
              <canvas id="bpublish" width="24" height="24"></canvas>
              <canvas id="bsnapshot" width="24" height="24"></canvas>
              <select id="songselect"><option value="">-</option></select>
              <span id="ajaxsong" style={{ display: "none" }}><span id="songprogress"></span></span>
              <span id="playbutton" style={{ display: "none" }}></span>
              <a id="snapshota" style={{ display: "none" }}>
                <canvas id="snapshot" width="128" height="128"></canvas>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden utility elements — required by main.js */}
      <canvas id="work" width="1024" height="1024" style={{ display: "none" }}></canvas>
      <canvas id="texcanvas" width="512" height="512" style={{ display: "none" }}></canvas>
      <canvas id="vigcanvas" width="240" height="180" style={{ display: "none" }}></canvas>
      <audio id="audio" preload="none"></audio>

      {/* Hidden elements that main.js references via getStyle/getId */}
      <div id="splash" style={{ display: "none" }}></div>
      <div id="play" style={{ display: "none" }}></div>
      <div id="pause" style={{ display: "none" }}></div>
      <div id="facem" style={{ display: "none" }}></div>

      {/* Load the face engine scripts — same as home.jsx */}
      <Script src="/jszip.js" strategy="beforeInteractive" />
      <Script src="/tools.js" strategy="beforeInteractive" />
      <Script src="/photoanim.js" strategy="beforeInteractive" />
      <Script src="/fd.js" strategy="afterInteractive" />
      <Script src="/facemodel.js" strategy="afterInteractive" />
      <Script src="/main.js" strategy="afterInteractive" />
    </React.Fragment>
  );
}

// Opt out of any shared Next.js layout
CameraOutput.getLayout = (page) => page;
