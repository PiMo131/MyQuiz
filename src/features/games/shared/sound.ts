/** Tiny WebAudio oscillator sound effects. Respects settings.sounds through `useSfx`. */
import { useCallback } from 'react'
import { useSettings } from '@/app/settings-store'

export type SfxName = 'select' | 'correct' | 'wrong' | 'clear' | 'win' | 'lose' | 'tick' | 'laser' | 'explode' | 'pop' | 'place' | 'levelUp'

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, delay = 0, slideTo?: number) {
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise(dur: number, gain = 0.12, delay = 0) {
  const ac = audio()
  if (!ac) return
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src = ac.createBufferSource()
  src.buffer = buf
  const g = ac.createGain()
  g.gain.value = gain
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  src.connect(lp).connect(g).connect(ac.destination)
  src.start(ac.currentTime + delay)
}

export const sfx: Record<SfxName, () => void> = {
  select: () => tone(660, 0.06, 'triangle', 0.05),
  pop: () => tone(520, 0.08, 'triangle', 0.06, 0, 780),
  place: () => tone(300, 0.07, 'square', 0.04, 0, 220),
  correct: () => {
    tone(523, 0.1, 'sine', 0.07)
    tone(784, 0.16, 'sine', 0.07, 0.08)
  },
  wrong: () => tone(220, 0.22, 'sawtooth', 0.05, 0, 140),
  clear: () => {
    tone(600, 0.08, 'triangle', 0.06)
    tone(800, 0.08, 'triangle', 0.06, 0.07)
    tone(1000, 0.14, 'triangle', 0.06, 0.14)
  },
  win: () => {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'sine', 0.07, i * 0.11))
  },
  lose: () => {
    ;[392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, i * 0.18))
  },
  tick: () => tone(1200, 0.03, 'square', 0.02),
  laser: () => tone(1400, 0.14, 'sawtooth', 0.04, 0, 300),
  explode: () => noise(0.3, 0.14),
  levelUp: () => {
    ;[660, 880, 1320].forEach((f, i) => tone(f, 0.12, 'square', 0.04, i * 0.08))
  },
}

/** Returns a `play(name)` that is a no-op when sounds are disabled in settings. */
export function useSfx(): (name: SfxName) => void {
  const enabled = useSettings((s) => s.settings.sounds)
  return useCallback(
    (name: SfxName) => {
      if (!enabled) return
      try {
        sfx[name]()
      } catch {
        /* audio not available */
      }
    },
    [enabled],
  )
}
