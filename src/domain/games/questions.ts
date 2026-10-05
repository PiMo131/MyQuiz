/** Shared helpers for turning cards into game questions (prompt/answer sides, multiple choice). */
import type { Card, Side } from '@/domain/types'
import { normalize, plainText, shuffle } from '@/domain/text'

/** Minimal card shape the game engines need (real `Card` satisfies it). */
export interface QuizCard {
  id: string
  term: string
  definition: string
  distractors?: string[]
  altAnswers?: string[]
  starred?: boolean
  suspended?: boolean
}

export type PromptSide = Side

/** Cards that can be used in a game: not suspended and both sides non-empty. */
export function playableCards<T extends QuizCard>(cards: readonly T[], starredOnly = false): T[] {
  const base = cards.filter((c) => !c.suspended && plainText(c.term).length > 0 && plainText(c.definition).length > 0)
  if (!starredOnly) return base
  const starred = base.filter((c) => c.starred)
  return starred.length >= 2 ? starred : base
}

export function otherSide(side: Side): Side {
  return side === 'term' ? 'definition' : 'term'
}

/** Text shown as the question when `side` is the prompt side. */
export function promptOf(card: QuizCard, side: PromptSide): string {
  return plainText(side === 'term' ? card.term : card.definition)
}

/** Text expected as the answer when `side` is the prompt side. */
export function answerOf(card: QuizCard, side: PromptSide): string {
  return plainText(side === 'term' ? card.definition : card.term)
}

/** Accepted answers for typed input (main answer + alternatives). */
export function acceptedAnswers(card: QuizCard, side: PromptSide): string[] {
  const main = side === 'term' ? card.definition : card.term
  const alts = side === 'term' ? (card.altAnswers ?? []) : []
  return [main, ...alts]
}

/**
 * Build `n` multiple-choice options (including the correct one) for `target`.
 * Uses user-supplied distractors first (when answering with the definition side), then other cards.
 */
export function buildChoices(cards: readonly QuizCard[], target: QuizCard, side: PromptSide, rng: () => number, n = 4): string[] {
  const correct = answerOf(target, side)
  const seen = new Set<string>([normalize(correct)])
  const out: string[] = [correct]
  const push = (txt: string) => {
    const p = plainText(txt)
    const key = normalize(p)
    if (!p || seen.has(key) || out.length >= n) return
    seen.add(key)
    out.push(p)
  }
  if (side === 'term') for (const d of target.distractors ?? []) push(d)
  const others = shuffle(cards.filter((c) => c.id !== target.id), rng)
  for (const c of others) push(answerOf(c, side))
  return shuffle(out, rng)
}

/** Infinite-ish deterministic card cycler: reshuffles when exhausted, never repeats the last card twice in a row. */
export function cardCycler<T extends QuizCard>(cards: readonly T[], rng: () => number): () => T {
  let queue: T[] = []
  let last: T | undefined
  return () => {
    if (queue.length === 0) {
      queue = shuffle(cards, rng)
      if (queue.length > 1 && queue[0] === last) queue.push(queue.shift() as T)
    }
    last = queue.shift() as T
    return last
  }
}

export type { Card }
