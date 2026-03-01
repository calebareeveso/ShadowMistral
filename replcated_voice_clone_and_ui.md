# Voice Clone & Onboarding UI — 1-Shot Replication Guide

> **Purpose**: This document gives an AI coding agent everything it needs to replicate the voice-recording onboarding and ElevenLabs voice-cloning functionality from the My-Stardust codebase. It intentionally **excludes** the avatar/photo/3D pipeline (StepAvatarCapture) and all Three.js scene rendering.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack & Dependencies](#2-technology-stack--dependencies)
3. [Environment Variables](#3-environment-variables)
4. [Files to Create](#4-files-to-create)
5. [File 1 — Electron Main Process (`background.js`)](#5-file-1--electron-main-process-backgroundjs)
6. [File 2 — Preload Script (`preload.js`)](#6-file-2--preload-script-preloadjs)
7. [File 3 — App Entry Point (`_app.jsx`)](#7-file-3--app-entry-point-_appjsx)
8. [File 4 — Onboarding Overlay (`OnboardingOverlay.jsx`)](#8-file-4--onboarding-overlay-onboardingoverlayjsx)
9. [File 5 — Voice Capture Step (`StepVoiceCapture.jsx`)](#9-file-5--voice-capture-step-stepvoicecapturejsx)
10. [File 6 — Global Styles (`globals.css`)](#10-file-6--global-styles-globalscss)
11. [ElevenLabs API Reference](#11-elevenlabs-api-reference)
12. [Full Pipeline Flow](#12-full-pipeline-flow)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                        │
│                                                                  │
│  electron-store ("user-profile")                                 │
│    ├─ onboardingComplete: true/false                             │
│    ├─ agentId: "agent_xxx"      (duplicated agent)               │
│    ├─ voiceId: "voice_xxx"      (cloned voice)                   │
│    └─ completedAt: ISO string                                    │
│                                                                  │
│  IPC Handlers:                                                   │
│    "get-user-profile"  → returns full store                      │
│    "set-user-profile"  → merges key/value pairs into store       │
│                                                                  │
│  Dev Shortcut: Cmd+Shift+R  → clears store + reloads window     │
│                                                                  │
│  Media Permissions: auto-grants "media" permission requests      │
│  macOS: explicitly calls askForMediaAccess('microphone')         │
└──────────────────────┬───────────────────────────────────────────┘
                       │ contextBridge (preload.js)
                       │ exposes window.ipc = { send, invoke, on }
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Renderer Process (Next.js)                   │
│                                                                  │
│  _app.jsx                                                        │
│    ├─ On mount: ipc.invoke('get-user-profile')                   │
│    ├─ If profile.onboardingComplete !== true → show overlay      │
│    └─ On overlay complete: ipc.invoke('set-user-profile', {...}) │
│                                                                  │
│  OnboardingOverlay.jsx                                           │
│    ├─ State machine: voice → done (avatar step removed)          │
│    ├─ Fade transitions between steps                             │
│    └─ Step indicator dots at bottom                              │
│                                                                  │
│  StepVoiceCapture.jsx                                            │
│    ├─ Phase: idle → recording → reviewing → processing           │
│    ├─ Records 10s audio via MediaRecorder (audio/webm;opus)      │
│    ├─ Real-time mic level via ScriptProcessorNode                │
│    ├─ On confirm:                                                │
│    │   1. POST  duplicate agent                                  │
│    │   2. POST  upload voice clone                               │
│    │   3. PATCH update agent voice                               │
│    │   4. Persist to electron-store                              │
│    └─ Skip button → use default voice                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack & Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | `^34.0.0` | Desktop shell |
| `nextron` | `^9.5.0` | Electron + Next.js framework |
| `next` | `^14.2.4` | React framework (SSR disabled for onboarding) |
| `react` | `^18.3.1` | UI library |
| `electron-store` | `^8.2.0` | Persistent JSON store for user profile |
| `@elevenlabs/react` | `^0.14.0` | ElevenLabs SDK (used in main app after onboarding) |

### Install command
```bash
npm install electron-store @elevenlabs/react
```

> **Note**: If you are NOT using Electron, replace `electron-store` with any persistent key-value store (localStorage, AsyncStorage, etc.) and replace the IPC bridge with direct function calls.

---

## 3. Environment Variables

Create a `.env` file in the renderer directory (accessible via `process.env.NEXT_PUBLIC_*` in Next.js):

```env
# ElevenLabs API key — used for all voice cloning and agent API calls
NEXT_PUBLIC_ELEVENLABS_API_KEY=sk_your_elevenlabs_api_key_here

# The "template" agent to duplicate for each new user
NEXT_PUBLIC_BASE_AGENT_ID=agent_3701k3ttaq12ewp8b7qv5rfyszkz
```

- **`NEXT_PUBLIC_ELEVENLABS_API_KEY`**: Your ElevenLabs API key (starts with `sk_`). Used as the `xi-api-key` header in all API calls.
- **`NEXT_PUBLIC_BASE_AGENT_ID`**: The ID of a pre-configured ElevenLabs Conversational AI agent that serves as the template. During onboarding, this agent is duplicated so each user gets their own copy with their cloned voice.

---

## 4. Files to Create

```
project/
├── main/
│   ├── background.js          # Electron main process
│   └── preload.js             # Context bridge
├── renderer/
│   ├── .env                   # API keys
│   ├── pages/
│   │   └── _app.jsx           # Onboarding state gate
│   ├── components/
│   │   └── onboarding/
│   │       ├── OnboardingOverlay.jsx   # Step container
│   │       └── StepVoiceCapture.jsx    # Voice recording + cloning
│   └── styles/
│       └── globals.css        # Base styles
└── package.json
```

---

## 5. File 1 — Electron Main Process (`background.js`)

This is the exact code for the main process. The key parts for voice clone onboarding are:
1. **`electron-store`** for persisting user profile (onboarding state, agentId, voiceId)
2. **IPC handlers** `get-user-profile` and `set-user-profile`
3. **Media permissions** auto-granting
4. **Dev reset shortcut** `Cmd+Shift+R`

```js
import path from 'path'
import { app, ipcMain } from 'electron'
import serve from 'electron-serve'

const isProd = process.env.NODE_ENV === 'production'

// Persistent user profile store (onboarding state, cloned agent ID, voice ID)
const Store = require('electron-store')
const userStore = new Store({ name: 'user-profile' })

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

// Fix to prevent WebRTC/Network Service crashes in Electron
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer')

;(async () => {
  await app.whenReady()

  // Grant media permissions (microphone) automatically so recording works
  const { session, systemPreferences } = require('electron')
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)   // <-- auto-approve microphone access
    } else {
      callback(false)
    }
  })

  // Explicitly ask macOS for microphone permissions to prevent crash
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status !== 'granted') {
      try {
        await systemPreferences.askForMediaAccess('microphone')
      } catch (e) {
        console.error('Failed to get microphone permissions:', e)
      }
    }
  }

  const { screen, BrowserWindow } = require('electron')
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  const mainWindow = new BrowserWindow({
    width: screenW,
    height: screenH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/home`)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
})()

// ─── Dev Shortcut: Reset Onboarding ──────────────────────────────────────────
app.on('ready', () => {
  const { globalShortcut, BrowserWindow } = require('electron')

  // Cmd+Shift+R resets the entire onboarding state and reloads the app
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    console.log('[Dev] Resetting onboarding state...')
    userStore.clear()                          // wipes agentId, voiceId, onboardingComplete
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      win.webContents.reload()                 // reloads renderer → _app.jsx re-checks profile
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

// ─── IPC: User profile persistence for onboarding ───────────────────────────
ipcMain.handle('get-user-profile', () => {
  return userStore.store    // returns the full JSON object
})

ipcMain.handle('set-user-profile', (_, data) => {
  Object.entries(data).forEach(([k, v]) => userStore.set(k, v))
  return userStore.store
})
```

### How the reset shortcut works:
When the user presses `Cmd+Shift+R`:
1. `userStore.clear()` — wipes the entire `electron-store` JSON file, removing `onboardingComplete`, `agentId`, `voiceId`, and everything else
2. `win.webContents.reload()` — forces the renderer to reload
3. On reload, `_app.jsx` calls `get-user-profile`, gets an empty object back, sees `onboardingComplete !== true`, and shows the onboarding overlay again

---

## 6. File 2 — Preload Script (`preload.js`)

This bridges the main process to the renderer securely:

```js
import { contextBridge, ipcRenderer } from 'electron'

const handler = {
  send(channel, value) {
    ipcRenderer.send(channel, value)
  },
  invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel, callback) {
    const subscription = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, subscription)

    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
}

contextBridge.exposeInMainWorld('ipc', handler)
```

**Usage in renderer**: `window.ipc.invoke('get-user-profile')`, `window.ipc.invoke('set-user-profile', { key: value })`, etc.

---

## 7. File 3 — App Entry Point (`_app.jsx`)

This is the root Next.js component. It gates the entire app behind the onboarding overlay:

```jsx
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import '../styles/globals.css'

// Load onboarding overlay client-side only (uses browser APIs like MediaRecorder)
const OnboardingOverlay = dynamic(
  () => import('../components/onboarding/OnboardingOverlay'),
  { ssr: false }
)

export default function MyApp({ Component, pageProps }) {
  // null = loading, false = show onboarding, true = done
  const [onboardingComplete, setOnboardingComplete] = useState(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.ipc) {
      window.ipc.invoke('get-user-profile').then((profile) => {
        setOnboardingComplete(profile?.onboardingComplete === true)
      })
    } else {
      // No IPC bridge (e.g. browser dev) — skip onboarding
      setOnboardingComplete(true)
    }
  }, [])

  const handleOnboardingComplete = () => {
    setOnboardingComplete(true)
    if (window.ipc) {
      window.ipc.invoke('set-user-profile', {
        onboardingComplete: true,
        completedAt: new Date().toISOString(),
      })
    }
  }

  return (
    <>
      <Component {...pageProps} />
      {onboardingComplete === false && (
        <OnboardingOverlay onComplete={handleOnboardingComplete} />
      )}
    </>
  )
}
```

### Key details:
- **`onboardingComplete` starts as `null`** (loading), so nothing renders during the IPC round-trip.
- Set to `false` when profile is empty or `onboardingComplete !== true` → shows overlay.
- Set to `true` only after the overlay calls `onComplete()`.
- `dynamic(..., { ssr: false })` is **critical** because `StepVoiceCapture` uses `navigator.mediaDevices`, `MediaRecorder`, `AudioContext`.

---

## 8. File 4 — Onboarding Overlay (`OnboardingOverlay.jsx`)

This is the container component. The original has two steps (voice + avatar). **For voice-only replication, simplify to just the voice step**:

```jsx
import { useReducer, useCallback, useState, useEffect } from 'react'
import StepVoiceCapture from './StepVoiceCapture'

/**
 * Onboarding flow (voice-only version):
 *  voice → done
 *
 * The voice step: Record 10s audio → duplicate base agent → clone voice → update agent voice
 * Skip button available — the full pipeline may fail without valid API keys.
 */

const initialState = {
  step: 'voice',       // 'voice' | 'done'
  agentId: null,       // ID of the newly duplicated ElevenLabs agent
  voiceId: null,       // ID of the cloned voice
  skippedVoice: false,
}

function reducer(state, action) {
  switch (action.type) {
    case 'VOICE_COMPLETE':
      return {
        ...state,
        agentId: action.payload.agentId,
        voiceId: action.payload.voiceId,
        step: 'done',
      }
    case 'VOICE_SKIP':
      return { ...state, skippedVoice: true, step: 'done' }
    default:
      return state
  }
}

export default function OnboardingOverlay({ onComplete }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [stepOpacity, setStepOpacity] = useState(1)
  const [overlayOpacity, setOverlayOpacity] = useState(1)

  // When step reaches 'done', fade the overlay out and call onComplete
  useEffect(() => {
    if (state.step !== 'done') return
    setOverlayOpacity(0)
    const t = setTimeout(() => onComplete(), 800)
    return () => clearTimeout(t)
  }, [state.step, onComplete])

  const transitionTo = useCallback((actionType, payload) => {
    setStepOpacity(0)
    setTimeout(() => {
      dispatch({ type: actionType, payload })
      setStepOpacity(1)
    }, 400)
  }, [])

  const handleVoiceComplete = useCallback(
    (agentId, voiceId) => transitionTo('VOICE_COMPLETE', { agentId, voiceId }),
    [transitionTo]
  )
  const handleVoiceSkip = useCallback(
    () => transitionTo('VOICE_SKIP'),
    [transitionTo]
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        fontFamily: '-apple-system, system-ui, BlinkMacSystemFont, sans-serif',
        color: '#fff',
        opacity: overlayOpacity,
        transition: 'opacity 0.8s ease',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div
        style={{
          width: '100%',
          height: '100%',
          opacity: stepOpacity,
          transition: 'opacity 0.4s ease',
        }}
      >
        {state.step === 'voice' && (
          <StepVoiceCapture
            onComplete={handleVoiceComplete}
            onSkip={handleVoiceSkip}
          />
        )}
      </div>

      {/* Step indicator dot (single dot for voice-only) */}
      {state.step === 'voice' && (
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            display: 'flex',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.8)',
            }}
          />
        </div>
      )}
    </div>
  )
}
```

### Key details:
- **`useReducer`** manages the step state machine.
- **Overlay fades out** with `opacity 0.8s ease` when `step === 'done'`.
- **Step content fades** with `opacity 0.4s ease` during transitions.
- **`@keyframes spin`** is injected globally for the processing spinner.
- If you want multiple steps later, add them back to the reducer and render conditionally.

---

## 9. File 5 — Voice Capture Step (`StepVoiceCapture.jsx`)

This is the **core file**. It handles the entire voice recording UI and the 4-step ElevenLabs API pipeline. Copy this exactly:

```jsx
import { useState, useRef, useEffect } from 'react'

/**
 * Step 1 — Voice
 *
 * Pipeline (all or nothing; user can skip):
 *  1. Record 10 seconds of audio via MediaRecorder
 *  2. POST /v1/convai/agents/{BASE_AGENT_ID}/duplicate  → newAgentId
 *  3. POST /v1/voices/add (multipart)                   → voiceId
 *  4. PATCH /v1/convai/agents/{newAgentId}              → set voice_id
 *  5. Save { agentId: newAgentId, voiceId } to electron-store
 *  6. Call onComplete(newAgentId, voiceId)
 *
 * Requires env vars (renderer/.env):
 *   NEXT_PUBLIC_ELEVENLABS_API_KEY   — xi-api-key header
 *   NEXT_PUBLIC_BASE_AGENT_ID        — agent to duplicate
 */

const RECORD_DURATION = 10 // seconds

const XI_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
const BASE_AGENT_ID = process.env.NEXT_PUBLIC_BASE_AGENT_ID || 'agent_3701k3ttaq12ewp8b7qv5rfyszkz'

// ─── API helpers ────────────────────────────────────────────────────────────

/**
 * Duplicates the base ElevenLabs agent to create a personal copy for this user.
 * 
 * POST https://api.elevenlabs.io/v1/convai/agents/{BASE_AGENT_ID}/duplicate
 * Headers: { "xi-api-key": XI_KEY, "Content-Type": "application/json" }
 * Body:    {}
 * Returns: { agent_id: "agent_xxx" }
 */
async function duplicateAgent() {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${BASE_AGENT_ID}/duplicate`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': XI_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail?.message || `Agent duplication failed (${res.status})`)
  }
  const data = await res.json()
  if (!data.agent_id) throw new Error('Duplicate response missing agent_id')
  return data.agent_id
}

/**
 * Uploads an audio blob to ElevenLabs instant voice cloning.
 * 
 * POST https://api.elevenlabs.io/v1/voices/add
 * Headers: { "xi-api-key": XI_KEY }
 * Body:    FormData with:
 *   - name: "stardust-voice-{timestamp}"
 *   - files: the audio blob as "voice-sample.webm"
 *   - remove_background_noise: "true"
 *   - description: "My Stardust voice clone"
 * Returns: { voice_id: "voice_xxx" }
 */
async function uploadVoiceClone(audioBlob) {
  const formData = new FormData()
  formData.append('name', `stardust-voice-${Date.now()}`)
  formData.append('files', audioBlob, 'voice-sample.webm')
  formData.append('remove_background_noise', 'true')
  formData.append('description', 'My Stardust voice clone')

  const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': XI_KEY },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail?.message || `Voice cloning failed (${res.status})`)
  }
  const data = await res.json()
  if (!data.voice_id) throw new Error('Voice add response missing voice_id')
  return data.voice_id
}

/**
 * Updates the duplicated agent to use the cloned voice.
 * 
 * PATCH https://api.elevenlabs.io/v1/convai/agents/{agentId}
 * Headers: { "xi-api-key": XI_KEY, "Content-Type": "application/json" }
 * Body:    { conversation_config: { tts: { voice_id: voiceId } } }
 */
async function updateAgentVoice(agentId, voiceId) {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': XI_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversation_config: {
        tts: { voice_id: voiceId },
      },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail?.message || `Agent voice update failed (${res.status})`)
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StepVoiceCapture({ onComplete, onSkip }) {
  const [phase, setPhase] = useState('idle') // idle | recording | reviewing | processing
  const [elapsed, setElapsed] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [micLevel, setMicLevel] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(null)

  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const audioCtxRef = useRef(null)
  const processorRef = useRef(null)
  const micLevelRef = useRef(0)
  const levelRafRef = useRef(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      cancelAnimationFrame(levelRafRef.current)
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      processorRef.current?.disconnect()
      if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close()
    }
  }, [])

  // Drive micLevel state from the processor ref during recording
  useEffect(() => {
    if (phase !== 'recording') return
    const tick = () => {
      levelRafRef.current = requestAnimationFrame(tick)
      setMicLevel(micLevelRef.current)
    }
    tick()
    return () => cancelAnimationFrame(levelRafRef.current)
  }, [phase])

  // ─── Recording Logic ───────────────────────────────────────────────────────

  const startRecording = async () => {
    setError(null)
    setElapsed(0)
    micLevelRef.current = 0

    try {
      // Step A: Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      // Step B: Set up real-time mic level monitoring
      // Uses ScriptProcessorNode because AnalyserNode returns zeros in Electron
      const audioCtx = new AudioContext()
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(2048, 1, 1)
      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
        micLevelRef.current = Math.sqrt(sum / data.length)
      }
      source.connect(processor)
      processor.connect(audioCtx.destination)
      processorRef.current = processor

      // Step C: Start MediaRecorder (audio/webm;codecs=opus)
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setPhase('reviewing')
        // Clean up audio pipeline
        processorRef.current?.disconnect()
        processorRef.current = null
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (audioCtxRef.current?.state !== 'closed') {
          audioCtxRef.current.close()
          audioCtxRef.current = null
        }
      }

      recorder.start(250) // collect data chunks every 250ms
      setPhase('recording')

      // Step D: Timer — auto-stop after RECORD_DURATION seconds
      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        const sec = (Date.now() - startTime) / 1000
        setElapsed(sec)
        if (sec >= RECORD_DURATION) {
          clearInterval(timerRef.current)
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
        }
      }, 100)
    } catch (e) {
      setError(`Microphone error: ${e.message}`)
    }
  }

  const stopEarly = () => {
    clearInterval(timerRef.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  const reRecord = () => {
    setAudioBlob(null)
    setElapsed(0)
    setMicLevel(0)
    micLevelRef.current = 0
    setPhase('idle')
    setError(null)
  }

  // ─── Voice Cloning Pipeline ────────────────────────────────────────────────

  const confirmVoice = async () => {
    if (!audioBlob) return
    setPhase('processing')
    setError(null)

    try {
      // Step 1: Duplicate the base agent so we get a personal copy
      setStatus('Duplicating your agent...')
      const newAgentId = await duplicateAgent()
      console.log('[Onboarding] Duplicated agent:', newAgentId)

      // Step 2: Upload the voice sample to ElevenLabs voice cloning
      setStatus('Cloning your voice...')
      const voiceId = await uploadVoiceClone(audioBlob)
      console.log('[Onboarding] Voice cloned:', voiceId)

      // Step 3: Update the NEW duplicated agent to use the cloned voice
      setStatus('Connecting voice to your agent...')
      await updateAgentVoice(newAgentId, voiceId)
      console.log('[Onboarding] Agent voice updated')

      // Step 4: Persist to electron-store
      if (window.ipc) {
        await window.ipc.invoke('set-user-profile', { agentId: newAgentId, voiceId })
      }

      onComplete(newAgentId, voiceId)
    } catch (e) {
      console.error('[Onboarding] Voice pipeline error:', e)
      setError(e.message)
      setPhase('reviewing')  // go back to review so user can retry or skip
      setStatus('')
    }
  }

  const progress = Math.min(elapsed / RECORD_DURATION, 1)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={centerColumn}>
      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={titleStyle}>Clone Your Voice</h2>
        <p style={subtitleStyle}>
          {phase === 'idle' && 'Speak for 10 seconds — read anything aloud'}
          {phase === 'recording' && 'Recording... keep talking naturally'}
          {phase === 'reviewing' && 'Ready to clone'}
          {phase === 'processing' && status}
        </p>
      </div>

      {/* Visual area — glass panel */}
      <div style={glassPanel}>
        {/* Mic level visualization (idle + recording) */}
        {(phase === 'idle' || phase === 'recording') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {/* Pulsing circle — scales with mic level */}
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                border: `2px solid rgba(255,255,255,${phase === 'recording' ? 0.6 : 0.2})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${1 + micLevel * 0.5})`,
                transition: 'transform 0.05s ease, border-color 0.3s ease',
                boxShadow: phase === 'recording'
                  ? `0 0 ${Math.round(micLevel * 40)}px rgba(255,255,255,0.3)`
                  : 'none',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: phase === 'recording'
                    ? `rgba(255,255,255,${0.3 + micLevel * 0.7})`
                    : 'rgba(255,255,255,0.1)',
                  transition: 'background 0.05s ease',
                }}
              />
            </div>

            {/* Progress bar during recording */}
            {phase === 'recording' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 200, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${progress * 100}%`,
                      height: '100%',
                      borderRadius: 2,
                      background: 'rgba(255,255,255,0.7)',
                      transition: 'width 0.1s linear',
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>
                  {Math.ceil(RECORD_DURATION - elapsed)}s remaining
                </span>
              </div>
            )}
          </div>
        )}

        {/* Review state — shows checkmark + audio player */}
        {phase === 'reviewing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 32, opacity: 0.6 }}>&#10003;</div>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              {Math.round(elapsed * 10) / 10}s recorded
            </span>
            {audioBlob && (
              <audio
                controls
                src={URL.createObjectURL(audioBlob)}
                style={{ marginTop: 8, opacity: 0.7, width: 260 }}
              />
            )}
          </div>
        )}

        {/* Processing state — shows spinner + status message */}
        {phase === 'processing' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={spinnerStyle} />
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{status}</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {phase === 'idle' && (
          <button onClick={startRecording} style={primaryBtn}>
            Start Recording
          </button>
        )}
        {phase === 'recording' && (
          <button onClick={stopEarly} style={primaryBtn}>
            Stop Early
          </button>
        )}
        {phase === 'reviewing' && (
          <>
            <button onClick={reRecord} style={secondaryBtn}>Re-record</button>
            <button onClick={confirmVoice} style={primaryBtn}>Use This Voice</button>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p style={{ color: 'rgba(255,100,100,0.8)', fontSize: 13, maxWidth: 400, textAlign: 'center', margin: 0 }}>
          {error}
        </p>
      )}

      {/* Skip button — always visible except during processing */}
      {phase !== 'processing' && (
        <button onClick={onSkip} style={skipBtn}>
          Skip — use default voice
        </button>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const centerColumn = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 32,
}

const titleStyle = {
  fontSize: 28,
  fontWeight: 300,
  color: 'rgba(255,255,255,0.9)',
  margin: 0,
  letterSpacing: 2,
}

const subtitleStyle = {
  fontSize: 14,
  color: 'rgba(255,255,255,0.4)',
  margin: '8px 0 0',
  letterSpacing: 0.5,
}

const glassPanel = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 24,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  padding: '40px 60px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 24,
  minWidth: 320,
  minHeight: 160,
  justifyContent: 'center',
}

const primaryBtn = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 30,
  padding: '12px 32px',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 14,
  cursor: 'pointer',
  letterSpacing: 1,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

const secondaryBtn = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 30,
  padding: '12px 32px',
  color: 'rgba(255,255,255,0.5)',
  fontSize: 14,
  cursor: 'pointer',
  letterSpacing: 1,
}

const skipBtn = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.3)',
  fontSize: 13,
  cursor: 'pointer',
  letterSpacing: 0.5,
  padding: '8px 16px',
}

const spinnerStyle = {
  width: 18,
  height: 18,
  border: '2px solid rgba(255,255,255,0.1)',
  borderTopColor: 'rgba(255,255,255,0.6)',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
}
```

---

## 10. File 6 — Global Styles (`globals.css`)

Minimal CSS reset for the onboarding UI:

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: transparent !important;
  color: #ffffff;
  font-family: system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

#__next {
  height: 100%;
  width: 100%;
  background: transparent !important;
}
```

---

## 11. ElevenLabs API Reference

These are the three API calls used during the voice cloning pipeline:

### 11.1 Duplicate Agent

```
POST https://api.elevenlabs.io/v1/convai/agents/{BASE_AGENT_ID}/duplicate
```

| Header | Value |
|--------|-------|
| `xi-api-key` | Your ElevenLabs API key |
| `Content-Type` | `application/json` |

**Body**: `{}`

**Response**: `{ "agent_id": "agent_xxx" }`

**Purpose**: Creates a personal copy of the base agent template. The duplicate inherits the system prompt, tools, and all configuration from the base agent. Each user gets their own agent so their cloned voice doesn't affect other users.

---

### 11.2 Upload Voice Clone (Instant Voice Cloning)

```
POST https://api.elevenlabs.io/v1/voices/add
```

| Header | Value |
|--------|-------|
| `xi-api-key` | Your ElevenLabs API key |

**Body**: `FormData` with:
| Field | Value |
|-------|-------|
| `name` | `stardust-voice-{timestamp}` (unique name) |
| `files` | The recorded audio blob, filename `voice-sample.webm` |
| `remove_background_noise` | `true` |
| `description` | `My Stardust voice clone` |

**Response**: `{ "voice_id": "voice_xxx" }`

**Important**: The audio must be at least a few seconds long. The codebase records 10 seconds. The file is sent as `audio/webm` format (recorded via `MediaRecorder` with `audio/webm;codecs=opus`).

---

### 11.3 Update Agent Voice

```
PATCH https://api.elevenlabs.io/v1/convai/agents/{agentId}
```

| Header | Value |
|--------|-------|
| `xi-api-key` | Your ElevenLabs API key |
| `Content-Type` | `application/json` |

**Body**:
```json
{
  "conversation_config": {
    "tts": {
      "voice_id": "voice_xxx"
    }
  }
}
```

**Purpose**: Sets the duplicated agent's TTS voice to the just-cloned voice, so when the agent speaks, it uses the user's voice.

---

## 12. Full Pipeline Flow

Here is the complete end-to-end flow in execution order:

```
1. App starts → Electron main process boots
   └─ Creates electron-store("user-profile")
   └─ Registers IPC handlers: get-user-profile, set-user-profile
   └─ Auto-grants microphone permissions
   └─ Registers Cmd+Shift+R shortcut (clears store + reloads)

2. Renderer loads → _app.jsx mounts
   └─ Calls window.ipc.invoke('get-user-profile')
   └─ Checks: profile.onboardingComplete === true?
       ├─ YES → Skip onboarding, show main app
       └─ NO  → Show <OnboardingOverlay>

3. OnboardingOverlay renders
   └─ State machine starts at step: 'voice'
   └─ Renders <StepVoiceCapture>

4. StepVoiceCapture — Phase: idle
   └─ Shows "Clone Your Voice" title
   └─ Shows dim pulsing circle (mic level = 0)
   └─ Buttons: [Start Recording] [Skip — use default voice]

5. User clicks "Start Recording"
   └─ navigator.mediaDevices.getUserMedia({ audio: {...} })
   └─ Creates AudioContext + ScriptProcessorNode for mic level
   └─ Creates MediaRecorder (audio/webm;codecs=opus)
   └─ Starts recording with recorder.start(250)
   └─ Starts timer interval (100ms ticks)
   └─ Phase → 'recording'

6. StepVoiceCapture — Phase: recording
   └─ Pulsing circle scales with mic level (1 + micLevel * 0.5)
   └─ Progress bar fills over 10 seconds
   └─ Countdown shows "Xs remaining"
   └─ Button: [Stop Early]
   └─ Auto-stops after 10 seconds (timer clears + recorder.stop())

7. recorder.onstop fires
   └─ Creates Blob from chunks
   └─ Saves to audioBlob state
   └─ Cleans up: stops tracks, disconnects processor, closes AudioContext
   └─ Phase → 'reviewing'

8. StepVoiceCapture — Phase: reviewing
   └─ Shows ✓ checkmark
   └─ Shows recorded duration
   └─ Shows <audio> player to preview recording
   └─ Buttons: [Re-record] [Use This Voice]

9. User clicks "Use This Voice"
   └─ Phase → 'processing'
   └─ Sequential API calls:
       a. setStatus('Duplicating your agent...')
          POST /v1/convai/agents/{BASE_AGENT_ID}/duplicate → newAgentId
       b. setStatus('Cloning your voice...')  
          POST /v1/voices/add (FormData with audioBlob) → voiceId
       c. setStatus('Connecting voice to your agent...')
          PATCH /v1/convai/agents/{newAgentId} → set voice_id
       d. window.ipc.invoke('set-user-profile', { agentId, voiceId })
   └─ Calls onComplete(newAgentId, voiceId)

10. OnboardingOverlay receives onComplete
    └─ Dispatches VOICE_COMPLETE → step = 'done'
    └─ Fades overlay out (opacity 0 over 0.8s)
    └─ Calls parent onComplete() after 800ms

11. _app.jsx handleOnboardingComplete
    └─ setOnboardingComplete(true)
    └─ ipc.invoke('set-user-profile', { onboardingComplete: true, completedAt: ... })
    └─ OnboardingOverlay unmounts
    └─ Main app is fully visible

12. On next app launch:
    └─ _app.jsx reads profile → onboardingComplete === true → skip onboarding
    └─ Main app uses stored agentId for ElevenLabs conversation sessions

13. Dev reset (Cmd+Shift+R):
    └─ userStore.clear() → wipes everything
    └─ win.webContents.reload() → renderer restarts
    └─ _app.jsx reads empty profile → shows onboarding again
```

---

## Error Handling Summary

| Error | Where | Behaviour |
|-------|-------|-----------|
| Microphone denied | `startRecording()` | Sets `error` state, stays in `idle` phase |
| API call fails (duplicate/clone/update) | `confirmVoice()` | Sets `error` state, reverts to `reviewing` phase so user can retry or skip |
| Missing API key | Any API call | `fetch` will return 401, caught by the error handler |
| AudioContext suspended | `startRecording()` | Explicitly calls `audioCtx.resume()` |
| AnalyserNode returns zeros | Electron bug | Uses `ScriptProcessorNode` instead |

---

## Key Implementation Notes for the Replicating Agent

1. **All styles are inline React `style={{}}` objects** — no external CSS classes needed except the global reset and the `@keyframes spin` animation.

2. **The `ScriptProcessorNode` is used instead of `AnalyserNode`** because Electron's Chromium returns all zeros from `AnalyserNode.getByteFrequencyData()`. The `onaudioprocess` callback computes RMS manually.

3. **The recording format is `audio/webm;codecs=opus`** — this is what Electron's Chromium supports. ElevenLabs accepts webm for voice cloning.

4. **`recorder.start(250)`** — data chunks are collected every 250ms, not at the end. This ensures `ondataavailable` fires multiple times.

5. **The overlay uses `position: fixed; inset: 0; zIndex: 100`** to cover the entire screen.

6. **`dynamic(() => import(...), { ssr: false })`** is required because `navigator.mediaDevices`, `MediaRecorder`, and `AudioContext` are browser-only APIs.

7. **The pipeline is all-or-nothing**: if any API call fails, the user is reverted to the reviewing phase where they can retry or skip. Skipping uses the base agent's default voice.

8. **The `electron-store` persists across app restarts** — it writes a JSON file to the user's app data directory. The dev reset shortcut (`Cmd+Shift+R`) clears this file entirely.
