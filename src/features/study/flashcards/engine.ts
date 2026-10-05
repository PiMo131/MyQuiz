/** Flashcard sorting engine (pure): Know / Still learning with undo and rounds. */
import type { Card, Id } from '@/domain/types'
import { mulberry32, shuffle } from '@/domain/text'

export interface SortState {
  order: Id[]
  index: number
  known: Id[]
  learning: Id[]
  history: Array<{ id: Id; known: boolean }>
  round: number
}

export function createSort(cards: Card[], opts: { shuffle?: boolean; seed?: number; starredOnly?: boolean } = {}): SortState {
  let list = cards.filter((c) => !c.suspended)
  if (opts.starredOnly) list = list.filter((c) => c.starred)
  const order = (opts.shuffle ? shuffle(list, mulberry32(opts.seed ?? 1)) : list).map((c) => c.id)
  return { order, index: 0, known: [], learning: [], history: [], round: 1 }
}

export function mark(state: SortState, known: boolean): SortState {
  const id = state.order[state.index]
  if (!id) return state
  return {
    ...state,
    index: state.index + 1,
    known: known ? [...state.known, id] : state.known,
    learning: known ? state.learning : [...state.learning, id],
    history: [...state.history, { id, known }],
  }
}

export function undo(state: SortState): SortState {
  const last = state.history[state.history.length - 1]
  if (!last) return state
  return {
    ...state,
    index: Math.max(0, state.index - 1),
    known: last.known ? state.known.slice(0, -1) : state.known,
    learning: last.known ? state.learning : state.learning.slice(0, -1),
    history: state.history.slice(0, -1),
  }
}

export function finished(state: SortState): boolean {
  return state.order.length > 0 && state.index >= state.order.length
}

/** Next round with only the still-learning cards. */
export function continueLearning(state: SortState, reshuffle = false, seed = 1): SortState {
  const order = reshuffle ? shuffle(state.learning, mulberry32(seed)) : state.learning
  return { order, index: 0, known: [], learning: [], history: [], round: state.round + 1 }
}
