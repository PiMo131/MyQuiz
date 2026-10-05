/** Lazy confetti burst (canvas-confetti is loaded on first use). */
export async function celebrate(intensity: 'small' | 'big' = 'big'): Promise<void> {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const { default: confetti } = await import('canvas-confetti')
    const colors = ['#6366f1', '#a855f7', '#06b6da', '#10b881', '#f59e0b']
    if (intensity === 'small') {
      void confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 }, colors })
      return
    }
    void confetti({ particleCount: 120, spread: 80, origin: { y: 0.65 }, colors })
    setTimeout(() => void confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors }), 200)
    setTimeout(() => void confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors }), 400)
  } catch {
    /* confetti is decoration only */
  }
}
