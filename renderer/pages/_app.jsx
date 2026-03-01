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
