/** Tiny WebAudio cues (no assets). */
export type Cue = 'correct' | 'wrong' | 'tick' | 'go' | 'finish' | 'join'

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', gain = 0.08): void {
  const ac = audio()
  if (!ac) return
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(gain, ac.currentTime + at)
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + dur)
  o.connect(g).connect(ac.destination)
  o.start(ac.currentTime + at)
  o.stop(ac.currentTime + at + dur + 0.02)
}

export function playCue(cue: Cue): void {
  try {
    switch (cue) {
      case 'correct':
        tone(660, 0, 0.12)
        tone(990, 0.1, 0.18)
        break
      case 'wrong':
        tone(220, 0, 0.25, 'sawtooth', 0.05)
        break
      case 'tick':
        tone(880, 0, 0.06, 'square', 0.03)
        break
      case 'go':
        tone(523, 0, 0.12)
        tone(659, 0.12, 0.12)
        tone(784, 0.24, 0.25)
        break
      case 'finish':
        tone(523, 0, 0.15)
        tone(659, 0.15, 0.15)
        tone(784, 0.3, 0.15)
        tone(1047, 0.45, 0.4)
        break
      case 'join':
        tone(740, 0, 0.08)
        tone(880, 0.08, 0.1)
        break
    }
  } catch {
    /* audio not available */
  }
}
