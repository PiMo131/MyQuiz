/** Tiny WebAudio sound effects (no assets, works offline). */
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.08) {
  const c = audio()
  if (!c) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, c.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration)
  o.connect(g).connect(c.destination)
  o.start(c.currentTime + start)
  o.stop(c.currentTime + start + duration + 0.02)
}

export const sfx = {
  correct() {
    tone(660, 0, 0.12)
    tone(880, 0.1, 0.18)
  },
  wrong() {
    tone(220, 0, 0.18, 'triangle', 0.07)
    tone(180, 0.12, 0.22, 'triangle', 0.07)
  },
  flip() {
    tone(520, 0, 0.05, 'sine', 0.03)
  },
  done() {
    tone(523, 0, 0.12)
    tone(659, 0.12, 0.12)
    tone(784, 0.24, 0.12)
    tone(1047, 0.36, 0.3)
  },
}
