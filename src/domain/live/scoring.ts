/** Scoring rules for live games. Pure functions, unit tested. */

export const MAX_BASE_POINTS = 1000
export const STREAK_BONUS = 100
export const MAX_STREAK_BONUS = 500
export const MIN_CORRECT_POINTS = 100

/** 1000 × remaining/limit, clamped. Without a limit a correct answer is worth the maximum. */
export function basePoints(remainingMs: number, limitMs: number): number {
  if (limitMs <= 0) return MAX_BASE_POINTS
  const ratio = Math.min(1, Math.max(0, remainingMs / limitMs))
  return Math.max(MIN_CORRECT_POINTS, Math.round(MAX_BASE_POINTS * ratio))
}

/** +100 per consecutive correct answer after the first, capped. */
export function streakBonus(streakAfter: number): number {
  if (streakAfter < 2) return 0
  return Math.min(MAX_STREAK_BONUS, (streakAfter - 1) * STREAK_BONUS)
}

export interface AnswerScoreInput {
  correct: boolean
  remainingMs: number
  limitMs: number
  streakAfter: number
  doubled: boolean
}

export function answerPoints(i: AnswerScoreInput): number {
  if (!i.correct) return 0
  const pts = basePoints(i.remainingMs, i.limitMs) + streakBonus(i.streakAfter)
  return i.doubled ? pts * 2 : pts
}

/** Match mode: points per matched pair plus a time bonus when the board is finished. */
export function matchPoints(pairs: number, elapsedMs: number, done: boolean): number {
  const base = pairs * 100
  if (!done) return base
  const bonus = Math.max(0, Math.round((180_000 - elapsedMs) / 100))
  return base + bonus
}
