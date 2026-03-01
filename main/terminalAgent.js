// Mistral → tool_call{terminal_code_agent} → IPC run-terminal-agent
// → runTerminalAgent(task) → [find → cd → spawn pty → write → read → review → exit]
// → returns summary string → IPC reply → renderer tool_result → Mistral continues

import * as pty from 'node-pty'
import stripAnsi from 'strip-ansi'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { BrowserWindow } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MISTRAL_MODEL = 'mistral-large-latest'

// ─── Mistral chat helper (matches the pattern in background.js) ───────────────

async function mistralChat(messages, tools) {
  const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY
  const body = {
    model: MISTRAL_MODEL,
    messages,
    tools,
    tool_choice: 'auto',
  }
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Mistral API error: ${res.status} ${await res.text()}`)
  return res.json()
}

// ─── Tool schema (Mistral / OpenAI function-calling format) ───────────────────

const ORCHESTRATOR_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'find_project_directory',
      description: 'List directories in "/Users/calebrulebase/Desktop" or current directory to find the right project folder.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enter_project_directory',
      description: 'Navigate into a project directory by name.',
      parameters: {
        type: 'object',
        properties: {
          project_name: { type: 'string', description: 'The name of the directory to enter.' },
        },
        required: ['project_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_claude_code',
      description: 'Spawn the Claude Code CLI via pty in the current directory and wait for the ready prompt.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_claude_code',
      description: 'Write a prompt into the Claude Code pty stdin and wait for the output to stabilise.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The task or follow-up instruction to send to Claude Code.' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'review_claude_code_response',
      description: 'Return the last output from Claude Code so the orchestrator can decide if the task is done.',
      parameters: {
        type: 'object',
        properties: {
          response:      { type: 'string', description: 'The raw output text returned by execute_claude_code.' },
          original_task: { type: 'string', description: 'The original task string for reference.' },
        },
        required: ['response', 'original_task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'claude_code_task_complete',
      description: 'Send /exit to close the Claude Code session, kill the pty process, and signal task completion.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
]

// ─── Tool implementations (closures over per-call state) ──────────────────────

function createToolExecutor() {
  let ptyProcess = null
  let ptyOutput = ''
  let currentDir = '/Users/calebrulebase/Desktop/terminal_agent'  // start on Desktop
  let terminalWindow = null
  let windowReady = false
  let dataBuffer = []  // holds pty chunks that arrive before the window is ready

  // Returns a Promise that resolves once the xterm window has finished loading
  function openTerminalWindow() {
    if (terminalWindow && !terminalWindow.isDestroyed()) {
      return Promise.resolve()
    }
    return new Promise(resolve => {
      windowReady = false
      dataBuffer = []
      terminalWindow = new BrowserWindow({
        width: 900,
        height: 560,
        minWidth: 600,
        minHeight: 300,
        title: 'Claude Code — Terminal Agent',
        backgroundColor: '#0d0d0d',
        webPreferences: {
          nodeIntegration: true,       // lets the viewer use require('electron') directly
          contextIsolation: false,     // required when nodeIntegration is true
        },
      })
      terminalWindow.loadFile(path.join(__dirname, 'terminal-viewer.html'))
      terminalWindow.webContents.on('did-finish-load', () => {
        windowReady = true
        if (dataBuffer.length > 0) {
          terminalWindow.webContents.send('pty-data', dataBuffer.join(''))
          dataBuffer = []
        }
        resolve()
      })
      terminalWindow.on('closed', () => { terminalWindow = null; windowReady = false })
    })
  }

  function sendToTerminalWindow(channel, payload) {
    if (!terminalWindow || terminalWindow.isDestroyed()) return
    if (!windowReady) {
      // Buffer until did-finish-load
      if (channel === 'pty-data') dataBuffer.push(payload)
      return
    }
    terminalWindow.webContents.send(channel, payload)
  }

  function closeTerminalWindow(delayMs = 0) {
    setTimeout(() => {
      if (terminalWindow && !terminalWindow.isDestroyed()) {
        terminalWindow.close()
        terminalWindow = null
      }
    }, delayMs)
  }

  function find_project_directory() {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      const directories = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name)
      return { directories, current_directory: currentDir }
    } catch (err) {
      return { directories: [], error: String(err.message) }
    }
  }

  function enter_project_directory({ project_name }) {
    const targetPath = path.join(currentDir, project_name)
    if (fs.existsSync(targetPath)) {
      currentDir = targetPath
      return { success: true, current_directory: currentDir }
    }
    return { success: false, error: `Directory "${project_name}" not found in ${currentDir}` }
  }

  async function run_claude_code() {
    ptyOutput = ''

    // Open terminal window and WAIT for it to finish loading before spawning pty
    await openTerminalWindow()

    // Spawn with --dangerously-skip-permissions:
    // This allows Claude Code to edit/write files without hanging on [y/N] confirmations.
    // It triggers a bypass-perms warning dialog on startup, which we auto-confirm below.
    ptyProcess = pty.spawn('claude', ['--dangerously-skip-permissions'], {
      name: 'xterm-color',
      cols: 220,
      rows: 50,
      cwd: currentDir,
      env: process.env,
    })

    // Safe write helper: waits `delay` ms before writing so the TUI has rendered the frame
    const safeWrite = (keys, delay = 300) =>
      new Promise(resolve => setTimeout(() => {
        if (ptyProcess) try { ptyProcess.write(keys) } catch {}
        resolve()
      }, delay))

    let autoTrusted = false
    let trustTimer = null

    function watchAndConfirm() {
      if (trustTimer) return
      trustTimer = setInterval(async () => {
        // Only look at the tail end of the buffer to avoid matching historical dialogs
        const recentLog = ptyOutput.slice(-3000)
        const clean = stripAnsi(recentLog)

        // Remove all whitespace in case stripAnsi squashed words together (e.g. "trustthisfolder")
        const compressed = clean.replace(/\s+/g, '')

        // Claude 2.1.50 renders a split-pane UI where the text is broken vertically by box-drawing characters:
        // "Is this a project you created or one you trust? | Tips for getting started"
        // This causes horizontal word-smashing when stripped.
        // The most reliable indicator is the title itself and the numbered options.
        const hasSafetyCheck = compressed.includes('Quicksafetycheck:Isthisaprojectyoucreatedoroneyoutrust') ||
                               compressed.includes('trustthisfolder') ||
                               clean.includes('1. Yes')
                               
        const hasStandardTrust = hasSafetyCheck && (clean.includes('Yes, I trust') || clean.includes('I trust this'))

        // Bypass-perms dialog: "Yes, I accept" + "No, exit" — need to send '2\r' to pick option 2
        // Claude 2.1.63 renders this tightly: "No,exit✔"
        const hasBypassDialog  = compressed.includes('Yes,Iaccept') && compressed.includes('No,exit')

        console.log(`[watchAndConfirm] tick | hasStandard=${hasStandardTrust} | hasBypass=${hasBypassDialog} | compressed=${compressed.slice(-50)}`)

        if (!hasStandardTrust && !hasBypassDialog) {
          // Dialog gone — stop watching (or hasn't appeared yet)
          return
        }

        if (!autoTrusted) {
          autoTrusted = true
          if (hasBypassDialog) {
            console.log('[watchAndConfirm] >>> Bypass dialog detected! Sending 2\\r')
            await safeWrite('2', 300)
            await safeWrite('\r', 150)
          } else {
            console.log('[watchAndConfirm] >>> Standard trust dialog detected! Sending \\r')
            await safeWrite('\r', 300)
          }
          // Reset so we retry if the dialog is still up next tick
          autoTrusted = false
        }
      }, 1000)
    }

    ptyProcess.onData(data => {
      ptyOutput += data
      sendToTerminalWindow('pty-data', data)
      // Start watching for trust prompts as soon as any data arrives
      watchAndConfirm()
    })

    return new Promise(resolve => {
      const deadline = Date.now() + 45000 // Give it plenty of time to start up
      const timer = setInterval(() => {
        // Only look at the tail end of the buffer to avoid matching historical dialogs
        const recentLog = ptyOutput.slice(-3000)
        const clean = stripAnsi(recentLog)
        const compressed = clean.replace(/\s+/g, '')
        
        const hasSafetyCheck = compressed.includes('Quicksafetycheck') || clean.includes('1. Yes')
        const hasBypass = compressed.includes('Yes,Iaccept') && compressed.includes('No,exit')
        const hasTrust  = hasSafetyCheck && (clean.includes('Yes, I trust') || clean.includes('I trust this'))
        const trustVisible = hasBypass || hasTrust

        // Claude Code v2.1.63 uses dynamic placeholders but always ends with "? for shortcuts"
        // It also uses the chevron "❯ " when an active command is running or finished
        const hasPrompt = clean.includes('welcome') || clean.includes('❯')

        console.log(`[ready-poll] trustVisible=${trustVisible} | hasPrompt=${hasPrompt} | clean length=${clean.length}`)

        // Don't declare ready while any dialog is currently visible
        if (trustVisible) {
          console.log('[ready-poll] Blocking READY because trust dialog is still visible.')
          return
        }

        // If we see a prompt, we're definitely ready.
        if (hasPrompt) {
          console.log('[ready-poll] >>> READY FIRED! (hasPrompt=true)')
          clearInterval(timer)
          if (trustTimer) { clearInterval(trustTimer); trustTimer = null }
          resolve({ success: true, status: 'ready', initial_output: clean.slice(-500) })
          return
        }

        // Fallback timeout protection
        if (Date.now() >= deadline) {
          console.log('[ready-poll] >>> TIMEOUT FIRED! (45s reached)')
          clearInterval(timer)
          if (trustTimer) { clearInterval(trustTimer); trustTimer = null }
          resolve({ success: true, status: 'spawned (timeout)', partial_output: clean.slice(-300) })
        }
      }, 400)
    })
  }

  function execute_claude_code({ prompt }) {
    return new Promise(resolve => {
      console.log('[execute_claude_code] Writing prompt to pty')
      ptyOutput = '' // Reset output buffer right before we send the fresh command
      
      // Give Ink a brief moment to yield the event loop before writing
      setTimeout(() => {
        try { ptyProcess.write(prompt) } catch {}
        setTimeout(() => { try { ptyProcess.write('\r') } catch {} }, 150)
        
        // Now that it's written, start watching for the output to stabilize
          let lastOutput = ''
          let stableCount = 0
          const deadline = Date.now() + 3 * 60 * 1000 // 3 minutes

          const timer = setInterval(() => {
            // Only look at the latest output chunk, otherwise we instantly match historical prompts
            const recentLog = ptyOutput.slice(-3000)
            const clean = stripAnsi(recentLog)
            
            // Claude Code ALWAYS prints "? for shortcuts" underneath the input field
            // when it has finished a task and returned to the interactive prompt.
            // When --dangerously-skip-permissions is used, it often says 
            // "bypass permissions on (shift + tab to cycle)" instead.
            const stabilised = clean.length > 200 && clean === lastOutput
            const compressed = clean.replace(/\s+/g, '')
            const hasPrompt = clean.includes('? for shortcuts') || 
                              compressed.includes('bypasspermissionson')

            if (stabilised && hasPrompt) {
              stableCount++
            } else {
              stableCount = 0
            }

            if (stableCount > 3) {
              clearInterval(timer)
              resolve({ success: true, result: clean.slice(-2000) })
            } else if (Date.now() >= deadline) {
              clearInterval(timer)
              resolve({ success: true, result: clean.slice(-1000), note: 'timeout reached' })
            }
            lastOutput = clean
          }, 500)
        }, 250)
    })
  }


  function review_claude_code_response({ response, original_task }) {
    return { response_text: response.slice(-2000), original_task }
  }

  function claude_code_task_complete() {
    if (ptyProcess) {
      try { ptyProcess.write('/exit\n') } catch {}
      setTimeout(() => { try { ptyProcess?.kill() } catch {} }, 1000)
      ptyProcess = null
    }
    // Signal done in the UI then close window after 3s so user can read final output
    sendToTerminalWindow('pty-status', 'done')
    closeTerminalWindow(3000)
    return { success: true }
  }

  async function executeTool(name, input) {
    switch (name) {
      case 'find_project_directory':      return find_project_directory()
      case 'enter_project_directory':     return enter_project_directory(input)
      case 'run_claude_code':             return run_claude_code()
      case 'execute_claude_code':         return execute_claude_code(input)
      case 'review_claude_code_response': return review_claude_code_response(input)
      case 'claude_code_task_complete':   return claude_code_task_complete()
      default:                            return { error: `Unknown tool: ${name}` }
    }
  }

  function cleanup() {
    if (ptyProcess) {
      try { ptyProcess.kill() } catch {}
      ptyProcess = null
    }
    closeTerminalWindow(0)
  }

  return { executeTool, cleanup }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runTerminalAgent(task) {
  const { executeTool, cleanup } = createToolExecutor()

  const messages = [
    {
      role: 'user',
      content: `You are an agent that controls Claude Code (a CLI coding tool) via a terminal session.

Your goal: complete this task → "${task}"

Steps you MUST follow in order:
1. Call find_project_directory to list available folders.
2. Identify the correct project folder from the task description and call enter_project_directory.
3. Call run_claude_code to open the Claude Code TUI.
4. Call execute_claude_code with the exact task string.
5. Call review_claude_code_response to examine the output.
6. If the task is NOT complete, call execute_claude_code again with a clarifying follow-up.
7. Repeat steps 5-6 until the task is confirmed complete (max 5 iterations).
8. Call claude_code_task_complete and stop.

Do not explain yourself. Start immediately with step 1.`,
    },
  ]

  let finalSummary = 'Task completed.'

  try {
    for (let i = 0; i < 30; i++) {
      const data = await mistralChat(messages, ORCHESTRATOR_TOOLS)
      const choice = data.choices[0]
      const assistantMsg = choice.message

      // Push assistant turn into history
      messages.push({ role: 'assistant', content: assistantMsg.content || '', tool_calls: assistantMsg.tool_calls })

      // No tool calls → LLM is done
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        if (assistantMsg.content) finalSummary = assistantMsg.content
        break
      }

      // Execute each tool call and collect results
      let shouldStop = false
      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function.name
        let fnArgs = {}
        try { fnArgs = JSON.parse(toolCall.function.arguments) } catch {}

        console.log(`[terminal-agent] Calling tool: ${fnName}`, fnArgs)
        const result = await executeTool(fnName, fnArgs)
        console.log(`[terminal-agent] Tool result:`, JSON.stringify(result).slice(0, 200))

        // Mistral tool result format
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: fnName,
          content: JSON.stringify(result),
        })

        if (fnName === 'claude_code_task_complete') {
          finalSummary = 'Task complete. Claude Code session closed. Last response captured.'
          shouldStop = true
        }
      }

      if (shouldStop) break
    }
  } finally {
    cleanup()
  }

  return finalSummary
}
