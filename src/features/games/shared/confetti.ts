import confetti from 'canvas-confetti'

export function fireConfetti() {
  try {
    void confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, zIndex: 70 })
    setTimeout(() => void confetti({ particleCount: 60, spread: 100, startVelocity: 35, origin: { y: 0.5 }, zIndex: 70 }), 250)
  } catch {
    /* ignore */
  }
}

export function burstAt(x: number, y: number, colors?: string[]) {
  try {
    void confetti({ particleCount: 18, spread: 60, startVelocity: 22, ticks: 60, origin: { x, y }, colors, zIndex: 70, scalar: 0.8 })
  } catch {
    /* ignore */
  }
}
