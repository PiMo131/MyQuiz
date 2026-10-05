/** React hook around the TTS engine. */
import { useEffect, useMemo } from 'react'
import { useSettings } from '@/app/settings-store'
import { loadVoices, pause, resume, speak, stop, useTtsStore, type SpeakOptions } from './engine'

export function useTts() {
  const speaking = useTtsStore((s) => s.speaking)
  const paused = useTtsStore((s) => s.paused)
  const supported = useTtsStore((s) => s.supported)
  const voices = useTtsStore((s) => s.voices)
  const enabled = useSettings((s) => s.settings.tts.enabled)
  useEffect(() => {
    loadVoices()
  }, [])
  return useMemo(
    () => ({
      speak: (text: string, lang?: string, opts?: SpeakOptions) =>
        enabled ? speak(text, lang, opts) : Promise.resolve(),
      stop,
      pause,
      resume,
      speaking,
      paused,
      supported,
      enabled,
      voices,
    }),
    [speaking, paused, supported, enabled, voices],
  )
}
