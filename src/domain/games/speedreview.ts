/** Speed Review engine: timed multiple choice, faster = more points. */
import { shuffle } from '@/domain/text'
import { answerOf, buildChoices, promptOf, type PromptSide, type QuizCard } from './questions'

export const SR_TIME_MS = 5000
export const SR_QUESTIONS = 20
export const SR_BASE_POINTS = 100
export const SR_MIN_POINTS = 20
export const SR_STREAK_BONUS = 10
export const SR_MAX_STREAK_BONUS = 5

export interface SpeedQuestion<T extends QuizCard = QuizCard> {
  card: T
  prompt: string
  options: string[]
  correct: string
}

export function buildSpeedQuestions<T extends QuizCard>(cards: readonly T[], rng: () => number, side: PromptSide, count = SR_QUESTIONS): SpeedQuestion<T>[] {
  const n = Math.min(count, cards.length)
  const chosen = shuffle(cards, rng).slice(0, n)
  return chosen.map((card) => {
    const options = buildChoices(cards, card, side, rng, 4)
    return { card, prompt: promptOf(card, side), options, correct: answerOf(card, side) }
  })
}

/** Points for a correct answer: linear from base (instant) to min (at the limit) + streak bonus. */
export function speedPoints(elapsedMs: number, streak: number, limitMs = SR_TIME_MS): number {
  const t = Math.min(1, Math.max(0, elapsedMs / limitMs))
  const base = Math.round(SR_BASE_POINTS - (SR_BASE_POINTS - SR_MIN_POINTS) * t)
  const bonus = Math.min(streak, SR_MAX_STREAK_BONUS) * SR_STREAK_BONUS
  return base + bonus
}
