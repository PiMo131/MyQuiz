/** Match game engine: 6 pairs = 12 tiles, pair term with definition as fast as possible. */
import type { Side } from '@/domain/types'
import { sample, shuffle } from '@/domain/text'
import { plainText } from '@/domain/text'
import type { QuizCard } from './questions'

export const MATCH_PAIRS = 6
export const MATCH_PENALTY_MS = 1000

export interface MatchTile {
  id: string
  cardId: string
  side: Side
  text: string
}

export type MatchEvent = 'select' | 'deselect' | 'correct' | 'wrong' | 'ignored'

export interface MatchState {
  tiles: MatchTile[]
  selected: string | null
  /** tile ids that have been matched away */
  matched: string[]
  wrong: number
  penaltyMs: number
  pairs: number
  lastEvent: MatchEvent | null
  lastTiles: string[]
}

export function createMatch(cards: readonly QuizCard[], rng: () => number, pairs = MATCH_PAIRS): MatchState {
  const chosen = sample(cards, Math.min(pairs, cards.length), rng)
  const tiles: MatchTile[] = chosen.flatMap((c) => [
    { id: `${c.id}:t`, cardId: c.id, side: 'term' as const, text: plainText(c.term) },
    { id: `${c.id}:d`, cardId: c.id, side: 'definition' as const, text: plainText(c.definition) },
  ])
  return { tiles: shuffle(tiles, rng), selected: null, matched: [], wrong: 0, penaltyMs: 0, pairs: chosen.length, lastEvent: null, lastTiles: [] }
}

export function selectTile(state: MatchState, tileId: string): MatchState {
  const tile = state.tiles.find((t) => t.id === tileId)
  if (!tile || state.matched.includes(tileId)) return { ...state, lastEvent: 'ignored', lastTiles: [] }
  if (state.selected === null) return { ...state, selected: tileId, lastEvent: 'select', lastTiles: [tileId] }
  if (state.selected === tileId) return { ...state, selected: null, lastEvent: 'deselect', lastTiles: [tileId] }
  const first = state.tiles.find((t) => t.id === state.selected)
  if (!first) return { ...state, selected: tileId, lastEvent: 'select', lastTiles: [tileId] }
  if (first.cardId === tile.cardId && first.side !== tile.side) {
    return { ...state, selected: null, matched: [...state.matched, first.id, tile.id], lastEvent: 'correct', lastTiles: [first.id, tile.id] }
  }
  return { ...state, selected: null, wrong: state.wrong + 1, penaltyMs: state.penaltyMs + MATCH_PENALTY_MS, lastEvent: 'wrong', lastTiles: [first.id, tile.id] }
}

export function isMatchComplete(state: MatchState): boolean {
  return state.pairs > 0 && state.matched.length >= state.pairs * 2
}

/** Format milliseconds as seconds with one decimal ("12.3"). */
export function formatTenths(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1)
}
