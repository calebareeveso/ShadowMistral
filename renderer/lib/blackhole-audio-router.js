import { useState, useEffect, useCallback } from 'react'

/**
 * useBlackHoleRouter — React hook for detecting BlackHole 2ch audio device
 * and redirecting ElevenLabs audio output to it.
 *
 * Usage:
 *   const { isBlackHoleActive, redirectAudioToBlackHole } = useBlackHoleRouter()
 *   // After ElevenLabs session connects:
 *   await redirectAudioToBlackHole()
 */
export function useBlackHoleRouter() {
  const [isBlackHoleActive, setIsBlackHoleActive] = useState(false)
  const [blackholeDeviceId, setBlackholeDeviceId] = useState(null)

  // Scan audio output devices for BlackHole
  const findBlackHoleDevice = async () => {
    try {
      // Must request mic permission first or device labels will be empty strings
      await navigator.mediaDevices.getUserMedia({ audio: true })

      const devices = await navigator.mediaDevices.enumerateDevices()

      // Look for BlackHole in output devices
      const blackhole = devices.find(d =>
        d.kind === 'audiooutput' &&
        (d.label.toLowerCase().includes('blackhole') ||
         d.label.toLowerCase().includes('black hole'))
      )

      if (blackhole) {
        console.log('[BlackHole] Found device:', blackhole.label, blackhole.deviceId)
        return blackhole.deviceId
      }

      console.warn('[BlackHole] Device not found. Install with: brew install blackhole-2ch')
      return null
    } catch (err) {
      console.error('[BlackHole] Error enumerating devices:', err)
      return null
    }
  }

  const checkBlackHoleAvailable = async () => {
    const id = await findBlackHoleDevice()
    setBlackholeDeviceId(id)
    return id !== null
  }

  // The main redirect function — call this after ElevenLabs session starts
  const redirectAudioToBlackHole = useCallback(async () => {
    const deviceId = blackholeDeviceId || await findBlackHoleDevice()

    if (!deviceId) {
      console.warn('[BlackHole] Cannot redirect — BlackHole not installed')
      return
    }

    setBlackholeDeviceId(deviceId)

    // Strategy 1: Find all <audio> elements on the page and setSinkId
    // ElevenLabs SDK may create <audio> elements to play audio
    const audioElements = document.querySelectorAll('audio')
    for (const audio of audioElements) {
      if ('setSinkId' in audio) {
        try {
          await audio.setSinkId(deviceId)
          console.log('[BlackHole] Redirected <audio> element to BlackHole')
          setIsBlackHoleActive(true)
        } catch (err) {
          console.error('[BlackHole] setSinkId failed on audio element:', err)
        }
      }
    }

    // Strategy 2: Override AudioContext to route to BlackHole
    patchAudioContextForBlackHole(deviceId)

    // Strategy 3: Watch for dynamically created audio elements (ElevenLabs creates them at runtime)
    observeNewAudioElements(deviceId)

    setIsBlackHoleActive(true)
    console.log('[BlackHole] Audio redirect active')
  }, [blackholeDeviceId])

  useEffect(() => {
    checkBlackHoleAvailable()
  }, [])

  return {
    isBlackHoleActive,
    blackholeDeviceId,
    redirectAudioToBlackHole,
    checkBlackHoleAvailable
  }
}

/**
 * Patches the global AudioContext constructor so any instance created
 * by the ElevenLabs SDK gets routed to BlackHole.
 */
function patchAudioContextForBlackHole(deviceId) {
  const OriginalAudioContext = window.AudioContext

  // Only patch once
  if (OriginalAudioContext.__blackholePatchApplied) return

  class PatchedAudioContext extends OriginalAudioContext {
    constructor(options) {
      super(options)
      if ('setSinkId' in this) {
        this.setSinkId(deviceId).catch((err) => {
          console.warn('[BlackHole] Could not set sinkId on AudioContext:', err)
        })
      }
    }
  }

  window.AudioContext = PatchedAudioContext
  window.AudioContext.__blackholePatchApplied = true
  console.log('[BlackHole] AudioContext constructor patched')
}

/**
 * MutationObserver to catch audio elements added dynamically by ElevenLabs SDK.
 */
function observeNewAudioElements(deviceId) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLAudioElement) {
          if ('setSinkId' in node) {
            node.setSinkId(deviceId).then(() => {
              console.log('[BlackHole] Redirected dynamically created <audio> to BlackHole')
            }).catch(console.warn)
          }
        }
        // Also check children of added nodes
        if (node instanceof Element) {
          const audioChildren = node.querySelectorAll('audio')
          audioChildren.forEach(async (audio) => {
            if ('setSinkId' in audio) {
              await audio.setSinkId(deviceId).catch(console.warn)
            }
          })
        }
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
  return observer
}

/**
 * Standalone utility — use this if you need the deviceId outside of React.
 */
export async function getBlackHoleDeviceId() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true })
    const devices = await navigator.mediaDevices.enumerateDevices()
    const bh = devices.find(d =>
      d.kind === 'audiooutput' && d.label.toLowerCase().includes('blackhole')
    )
    return bh ? bh.deviceId : null
  } catch {
    return null
  }
}
