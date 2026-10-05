import type { StudyMode } from '@/domain/types'

export type GameId = 'match' | 'blocks' | 'blast' | 'charms' | 'hangman' | 'wordsearch' | 'speedreview'

export interface GameMeta {
  id: GameId
  /** css gradient class for hub cards / intro */
  gradient: string
  lowerIsBetter: boolean
  minCards: number
}

export const GAMES: GameMeta[] = [
  { id: 'match', gradient: 'bg-gradient-indigo', lowerIsBetter: true, minCards: 2 },
  { id: 'blocks', gradient: 'bg-gradient-teal', lowerIsBetter: false, minCards: 2 },
  { id: 'blast', gradient: 'bg-gradient-indigo', lowerIsBetter: false, minCards: 3 },
  { id: 'charms', gradient: 'bg-gradient-orange', lowerIsBetter: false, minCards: 4 },
  { id: 'hangman', gradient: 'bg-gradient-green', lowerIsBetter: false, minCards: 1 },
  { id: 'wordsearch', gradient: 'bg-gradient-teal', lowerIsBetter: true, minCards: 3 },
  { id: 'speedreview', gradient: 'bg-gradient-orange', lowerIsBetter: false, minCards: 4 },
]

export const gameMeta = (id: GameId): GameMeta => GAMES.find((g) => g.id === id) as GameMeta

/** Study modes shown in the header mode switcher (besides games). */
export const STUDY_MODES: StudyMode[] = ['flashcards', 'learn', 'write', 'spell', 'test', 'srs']

export const LAST_SET_KEY = 'myquizz.games.lastSet'

/** Human-readable best score: time-based games show seconds with one decimal. */
export function formatBest(game: GameId, value: number | undefined): string {
  if (value === undefined) return '–'
  return gameMeta(game).lowerIsBetter ? `${(value / 1000).toFixed(1)} s` : String(Math.round(value))
}
