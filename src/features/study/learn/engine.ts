/**
 * Adaptive Learn engine (pure). Each card must be answered correctly `stepsPerCard` times
 * (multiple choice first, then written) to be mastered. Wrong answers are re-queued later in the
 * round. Rounds hold ~7 cards.
 */
import type { Card, GradingStrictness, Id, QuestionType } from '@/domain/types'
import {
  makeFlashcard,
  makeMultipleChoice,
  makeWritten,
  type AnswerWith,
  type ImageOptions,
  type Question,
} from '@/domain/question-generator'
import { mulberry32, shuffle } from '@/domain/text'

export type LearnGoal = 'cram' | 'memorize'
export type LearnQuestionType = Extract<QuestionType, 'multipleChoice' | 'written' | 'flashcard'>

export interface LearnConfig {
  goal: LearnGoal
  types: Record<LearnQuestionType, boolean>
  answerWith: AnswerWith
  images: ImageOptions
  strictness: GradingStrictness
  retype: boolean
  shuffle: boolean
  starredOnly: boolean
  sounds: boolean
  tts: boolean
  roundSize: number
}

export const DEFAULT_LEARN_CONFIG: LearnConfig = {
  goal: 'memorize',
  types: { multipleChoice: true, written: true, flashcard: false },
  answerWith: 'definition',
  images: { questions: true, choices: true },
  strictness: 'moderate',
  retype: false,
  shuffle: true,
  starredOnly: false,
  sounds: true,
  tts: false,
  roundSize: 7,
}

export interface CardProgress {
  cardId: Id
  /** Correct answers so far (0..stepsPerCard). */
  stage: number
  misses: number
}

export interface LearnState {
  config: LearnConfig
  stepsPerCard: number
  cards: Record<Id, CardProgress>
  /** Not-yet-mastered card ids in order of appearance. */
  queue: Id[]
  /** Cards in the current round that still need a question. */
  round: Id[]
  roundNumber: number
  /** Card ids that were part of this round (for the summary). */
  roundCards: Id[]
  /** Correct answers in this round. */
  roundCorrect: number
  roundWrong: number
  current: Question | null
  done: boolean
  seed: number
}

export function stepsFor(goal: LearnGoal): number {
  return goal === 'cram' ? 1 : 2
}

export function eligibleCards(cards: Card[], config: LearnConfig): Card[] {
  const list = cards.filter((c) => !c.suspended && (c.term.trim() || c.definition.trim()))
  return config.starredOnly ? list.filter((c) => c.starred) : list
}

export function createLearn(cards: Card[], config: LearnConfig, seed = Date.now() % 1_000_000): LearnState {
  const list = eligibleCards(cards, config)
  const rng = mulberry32(seed)
  const order = (config.shuffle ? shuffle(list, rng) : list).map((c) => c.id)
  const state: LearnState = {
    config,
    stepsPerCard: stepsFor(config.goal),
    cards: Object.fromEntries(order.map((id) => [id, { cardId: id, stage: 0, misses: 0 }])),
    queue: order,
    round: [],
    roundNumber: 0,
    roundCards: [],
    roundCorrect: 0,
    roundWrong: 0,
    current: null,
    done: order.length === 0,
    seed,
  }
  return state
}

/** Begin the next round: take up to roundSize cards from the queue. */
export function startRound(state: LearnState): LearnState {
  if (!state.queue.length) return { ...state, done: true, current: null, round: [] }
  const round = state.queue.slice(0, state.config.roundSize)
  return { ...state, round, roundCards: round, roundNumber: state.roundNumber + 1, roundCorrect: 0, roundWrong: 0, current: null }
}

/** Which question type a card gets at its current stage. */
export function questionTypeFor(state: LearnState, cardId: Id): LearnQuestionType {
  const enabled = (Object.keys(state.config.types) as LearnQuestionType[]).filter((k) => state.config.types[k])
  const order: LearnQuestionType[] = ['multipleChoice', 'written', 'flashcard']
  const avail = order.filter((t) => enabled.includes(t))
  if (!avail.length) return 'multipleChoice'
  const stage = state.cards[cardId]?.stage ?? 0
  // Stage 0 -> first enabled (MC), last stage -> last enabled (written); in between walk the list.
  if (state.stepsPerCard <= 1) return avail[avail.length - 1] === 'flashcard' && avail.length > 1 ? avail[avail.length - 2] : avail[avail.length - 1]
  const idx = Math.min(avail.length - 1, Math.round((stage / (state.stepsPerCard - 1)) * (avail.length - 1)))
  return avail[idx]
}

/** Build the question for the next card in the round. Pool = all cards (for distractors). */
export function nextQuestion(state: LearnState, cards: Card[], rng: () => number = Math.random): LearnState {
  if (state.done) return state
  let s = state
  if (!s.round.length) {
    s = startRound(s)
    if (s.done) return s
  }
  const byId = new Map(cards.map((c) => [c.id, c]))
  const cardId = s.round[0]
  const card = byId.get(cardId)
  if (!card) {
    // Card was deleted meanwhile: drop it.
    const { [cardId]: _gone, ...rest } = s.cards
    void _gone
    return nextQuestion({ ...s, cards: rest, round: s.round.slice(1), queue: s.queue.filter((id) => id !== cardId) }, cards, rng)
  }
  const type = questionTypeFor(s, cardId)
  const opts = { answerWith: s.config.answerWith, images: s.config.images, rng }
  const pool = eligibleCards(cards, { ...s.config, starredOnly: false })
  let q: Question
  if (type === 'multipleChoice' && pool.length >= 2) q = makeMultipleChoice(card, pool, opts)
  else if (type === 'flashcard') q = makeFlashcard(card, opts)
  else q = makeWritten(card, opts)
  return { ...s, current: q }
}

/** Apply the outcome of the current question. */
export function answerCurrent(state: LearnState, correct: boolean): LearnState {
  const q = state.current
  if (!q || !('cardId' in q)) return state
  const id = q.cardId
  const cp = state.cards[id] ?? { cardId: id, stage: 0, misses: 0 }
  const roundRest = state.round.slice(1)
  if (correct) {
    const stage = cp.stage + 1
    const mastered = stage >= state.stepsPerCard
    const round = mastered ? roundRest : [...roundRest, id]
    const queue = mastered ? state.queue.filter((x) => x !== id) : state.queue
    return {
      ...state,
      cards: { ...state.cards, [id]: { ...cp, stage } },
      round,
      queue,
      roundCorrect: state.roundCorrect + 1,
      current: null,
      done: queue.length === 0,
    }
  }
  // Wrong: re-queue later in the round (after at least one other card when possible).
  const insertAt = Math.min(roundRest.length, 2)
  const round = [...roundRest.slice(0, insertAt), id, ...roundRest.slice(insertAt)]
  return {
    ...state,
    cards: { ...state.cards, [id]: { ...cp, misses: cp.misses + 1 } },
    round,
    roundWrong: state.roundWrong + 1,
    current: null,
  }
}

/** Overall progress: completed steps out of stepsPerCard * cards. */
export function learnProgress(state: LearnState): { done: number; total: number } {
  const all = Object.values(state.cards)
  const total = all.length * state.stepsPerCard
  const done = all.reduce((n, c) => n + Math.min(c.stage, state.stepsPerCard), 0)
  return { done, total }
}

export function roundFinished(state: LearnState): boolean {
  return !state.done && state.round.length === 0 && state.current === null && state.roundNumber > 0
}

export function masteredCount(state: LearnState): number {
  return Object.values(state.cards).filter((c) => c.stage >= state.stepsPerCard).length
}

/** Change config mid-session (keeps progress, restarts the current round). */
export function reconfigure(state: LearnState, config: LearnConfig): LearnState {
  const steps = stepsFor(config.goal)
  return { ...state, config, stepsPerCard: steps, current: null, round: [], done: state.queue.length === 0 }
}
