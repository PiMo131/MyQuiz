/**
 * Write / Spell engine (pure): go through every card once; wrong ones come back in extra rounds
 * until all are correct.
 */
import type { Card, Id } from '@/domain/types'
import { makeWritten, type AnswerWith, type WrittenQuestion } from '@/domain/question-generator'
import { mulberry32, shuffle } from '@/domain/text'

export interface WriteState {
  order: Id[]
  /** Cards still to be asked in the current round. */
  queue: Id[]
  /** Cards answered wrong this round (asked again next round). */
  wrong: Id[]
  correct: number
  incorrect: number
  round: number
  current: WrittenQuestion | null
  done: boolean
  total: number
}

export function createWrite(cards: Card[], opts: { starredOnly?: boolean; shuffle?: boolean; seed?: number } = {}): WriteState {
  let list = cards.filter((c) => !c.suspended && (c.term.trim() || c.definition.trim()))
  if (opts.starredOnly) list = list.filter((c) => c.starred)
  const rng = mulberry32(opts.seed ?? 1)
  const order = (opts.shuffle === false ? list : shuffle(list, rng)).map((c) => c.id)
  return { order, queue: order, wrong: [], correct: 0, incorrect: 0, round: 1, current: null, done: order.length === 0, total: order.length }
}

export function nextWrite(state: WriteState, cards: Card[], answerWith: AnswerWith, rng: () => number = Math.random): WriteState {
  if (state.done) return state
  let s = state
  if (!s.queue.length) {
    if (!s.wrong.length) return { ...s, done: true, current: null }
    s = { ...s, queue: s.wrong, wrong: [], round: s.round + 1 }
  }
  const byId = new Map(cards.map((c) => [c.id, c]))
  const card = byId.get(s.queue[0])
  if (!card) return nextWrite({ ...s, queue: s.queue.slice(1) }, cards, answerWith, rng)
  return { ...s, current: makeWritten(card, { answerWith, rng }) }
}

export function answerWrite(state: WriteState, correct: boolean): WriteState {
  if (!state.current) return state
  const id = state.current.cardId
  const queue = state.queue.slice(1)
  const wrong = correct ? state.wrong : [...state.wrong, id]
  return {
    ...state,
    queue,
    wrong,
    correct: state.correct + (correct ? 1 : 0),
    incorrect: state.incorrect + (correct ? 0 : 1),
    current: null,
    done: queue.length === 0 && wrong.length === 0,
  }
}

/** Remaining in this round (incl. the current one). */
export function remaining(state: WriteState): number {
  return state.queue.length
}

/** Undo the last "incorrect" and count it as correct (the "I was correct" override). */
export function overrideCorrect(state: WriteState, cardId: Id): WriteState {
  if (!state.wrong.includes(cardId)) return state
  const wrong = state.wrong.filter((x) => x !== cardId)
  return { ...state, wrong, correct: state.correct + 1, incorrect: Math.max(0, state.incorrect - 1), done: state.queue.length === 0 && wrong.length === 0 }
}
