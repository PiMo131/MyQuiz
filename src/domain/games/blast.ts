/** Blast engine: pure parts (rounds, scoring, levels, asteroid motion). The canvas loop lives in the UI. */
import { buildChoices, promptOf, type PromptSide, type QuizCard } from './questions'

export const BLAST_ROUND_MS = 90_000
export const BLAST_PROMPT_MS = 8_000
export const BLAST_BASE_POINTS = 10
export const BLAST_STREAK_SEGMENTS = 10

export interface BlastRound<T extends QuizCard = QuizCard> {
  card: T
  prompt: string
  options: string[]
  correct: string
}

export function makeBlastRound<T extends QuizCard>(cards: readonly T[], card: T, rng: () => number, side: PromptSide, level = 1): BlastRound<T> {
  const n = Math.min(5, Math.max(3, 2 + level), cards.length)
  const options = buildChoices(cards, card, side, rng, Math.max(2, n))
  const correctRaw = side === 'term' ? card.definition : card.term
  const correct = options.find((o) => o === correctRaw) ?? options[0]
  return { card, prompt: promptOf(card, side), options, correct }
}

/** Multiplier grows every 3 correct in a row, capped at 4x. */
export function streakMultiplier(streak: number): number {
  return Math.min(4, 1 + Math.floor(streak / 3))
}

export function blastPoints(streak: number): number {
  return BLAST_BASE_POINTS * streakMultiplier(streak)
}

export function levelGoal(level: number): number {
  return 50 * level
}

export interface LevelState {
  level: number
  into: number
  goal: number
}

/** Cumulative level progress for a total score (lvl1 needs 50, lvl2 100, …). */
export function levelState(score: number): LevelState {
  let level = 1
  let rest = Math.max(0, score)
  while (rest >= levelGoal(level)) {
    rest -= levelGoal(level)
    level++
  }
  return { level, into: rest, goal: levelGoal(level) }
}

export interface Asteroid {
  id: number
  text: string
  correct: boolean
  x: number // centre, px
  y: number
  vx: number
  vy: number
  r: number
  rot: number
  vr: number
  alive: boolean
}

/** Spread asteroids across the width, staggered above the top edge. */
export function spawnAsteroids(options: readonly string[], correct: string, width: number, rng: () => number, startId: number, level = 1): Asteroid[] {
  const n = options.length
  const colW = width / n
  const order = options.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const r = Math.max(34, Math.min(60, colW * 0.36))
  const speed = 28 + level * 6
  return options.map((text, i) => {
    const slot = order[i]
    return {
      id: startId + i,
      text,
      correct: text === correct,
      x: colW * slot + colW / 2 + (rng() - 0.5) * Math.max(0, colW - 2 * r) * 0.6,
      y: -r - rng() * 120,
      vx: (rng() - 0.5) * 18,
      vy: speed * (0.85 + rng() * 0.3),
      r,
      rot: rng() * Math.PI * 2,
      vr: (rng() - 0.5) * 0.6,
      alive: true,
    }
  })
}

/** Advance asteroids by dt seconds, bouncing off the side walls. Mutates in place for the rAF loop. */
export function stepAsteroids(list: Asteroid[], dt: number, width: number): void {
  for (const a of list) {
    if (!a.alive) continue
    a.x += a.vx * dt
    a.y += a.vy * dt
    a.rot += a.vr * dt
    if (a.x - a.r < 0) { a.x = a.r; a.vx = Math.abs(a.vx) }
    if (a.x + a.r > width) { a.x = width - a.r; a.vx = -Math.abs(a.vx) }
  }
}

export function hitAsteroid(list: readonly Asteroid[], x: number, y: number): Asteroid | undefined {
  // iterate from last (drawn on top) to first
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i]
    if (!a.alive) continue
    const dx = x - a.x
    const dy = y - a.y
    if (dx * dx + dy * dy <= (a.r * 1.15) ** 2) return a
  }
  return undefined
}

/** True when any living asteroid has drifted past the bottom (missed). */
export function anyEscaped(list: readonly Asteroid[], height: number): boolean {
  return list.some((a) => a.alive && a.y - a.r > height)
}
