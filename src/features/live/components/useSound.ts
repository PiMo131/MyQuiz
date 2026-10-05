import { useCallback, useState } from 'react'
import { useSettings } from '@/app/settings-store'
import { playCue, type Cue } from '../sounds'
import { loadSoundPref, saveSoundPref } from '../storage'

/** Sound toggle for live screens: defaults to the global setting, remembered per device. */
export function useSound() {
  const global = useSettings((s) => s.settings.sounds)
  const [on, setOn] = useState<boolean>(() => loadSoundPref() ?? global)
  const toggle = useCallback(() => {
    setOn((v) => {
      saveSoundPref(!v)
      return !v
    })
  }, [])
  const play = useCallback(
    (cue: Cue) => {
      if (on) playCue(cue)
    },
    [on],
  )
  return { on, toggle, play }
}
