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
        backgroundColor: 'rgba(8, 8, 8, 0.9)',
        backgroundImage: 'radial-gradient(circle at center, rgba(225,5,0,0.15), rgba(8,8,8,0.95) 70%)',
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
              width: 8,
              height: 8,
              borderRadius: 0,
              background: '#FD7F03',
            }}
          />
        </div>
      )}
    </div>
  )
}
