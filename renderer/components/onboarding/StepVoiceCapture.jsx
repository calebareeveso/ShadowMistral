import { useState, useRef, useEffect } from 'react'
import { Check } from 'lucide-react'

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

const XI_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || ''
const BASE_AGENT_ID = process.env.NEXT_PUBLIC_BASE_AGENT_ID || 'agent_3701k3ttaq12ewp8b7qv5rfyszkz'

// ─── API helpers ────────────────────────────────────────────────────────────

/**
 * Duplicates the base ElevenLabs agent to create a personal copy for this user.
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
      const audioCtx = new window.AudioContext()
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
                borderRadius: 0,
                border: `2px solid rgba(253,127,3,${phase === 'recording' ? 0.6 : 0.2})`,
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
                  borderRadius: 0,
                  background: phase === 'recording'
                    ? `rgba(253,127,3,${0.3 + micLevel * 0.7})`
                    : 'rgba(253,127,3,0.1)',
                  transition: 'background 0.05s ease',
                }}
              />
            </div>

            {/* Progress bar during recording */}
            {phase === 'recording' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 200, height: 4, borderRadius: 0, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${progress * 100}%`,
                      height: '100%',
                      borderRadius: 0,
                      background: '#FD7F03',
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
            <Check size={48} color="#FD7F03" strokeWidth={1.5} />
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
  background: 'rgba(18,18,18,0.9)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderTop: '2px solid transparent',
  borderColor: 'rgba(253, 127, 3, 0.3)',
  borderRadius: 0,
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
  background: 'rgba(253,127,3,0.2)',
  border: '1px solid rgba(253, 127, 3, 0.4)', backdropFilter: 'blur(10px)',
  borderRadius: 0,
  padding: '12px 32px',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 14,
  cursor: 'pointer',
  letterSpacing: 1,
  boxShadow: 'none',
}

const secondaryBtn = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(253,127,3,0.4)',
  borderRadius: 0,
  padding: '12px 32px',
  color: '#FD7F03',
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
  borderTopColor: '#E10500',
  borderRadius: 0,
  animation: 'spin 0.8s linear infinite',
}
