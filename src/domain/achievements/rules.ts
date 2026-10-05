import type { AchievementStats } from './stats'

export type AchievementCategory = 'study' | 'streak' | 'games' | 'create' | 'special'

export interface AchievementDef {
  id: string
  icon: string // emoji
  category: AchievementCategory
  /** Target value for progress display, when meaningful. */
  target?: number
  progress?: (s: AchievementStats) => number
  condition: (s: AchievementStats) => boolean
}

const plays = (s: AchievementStats, game: string) => s.gamePlays[game] ?? 0

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-set', icon: '✨', category: 'create', target: 1, progress: (s) => s.sets, condition: (s) => s.sets >= 1 },
  { id: 'importer', icon: '📥', category: 'create', target: 1, progress: (s) => s.imports, condition: (s) => s.imports >= 1 },
  { id: 'sharer', icon: '🔗', category: 'create', target: 1, progress: (s) => s.shares, condition: (s) => s.shares >= 1 },
  { id: 'flashcard-whiz', icon: '🃏', category: 'study', target: 100, progress: (s) => s.flashcardsFlipped, condition: (s) => s.flashcardsFlipped >= 100 },
  { id: 'active-learner', icon: '🚀', category: 'study', target: 3, progress: (s) => s.studyDays, condition: (s) => s.studyDays >= 3 },
  { id: 'committed-learner', icon: '🎯', category: 'streak', target: 7, progress: (s) => s.longestStreak, condition: (s) => s.longestStreak >= 7 },
  { id: 'streak-30', icon: '🔥', category: 'streak', target: 30, progress: (s) => s.longestStreak, condition: (s) => s.longestStreak >= 30 },
  { id: 'streak-100', icon: '💎', category: 'streak', target: 100, progress: (s) => s.longestStreak, condition: (s) => s.longestStreak >= 100 },
  { id: 'match-whiz', icon: '🧩', category: 'games', target: 5, progress: (s) => plays(s, 'match'), condition: (s) => plays(s, 'match') >= 5 },
  { id: 'blocks-whiz', icon: '🧱', category: 'games', target: 5, progress: (s) => plays(s, 'blocks'), condition: (s) => plays(s, 'blocks') >= 5 },
  { id: 'blast-whiz', icon: '🚀', category: 'games', target: 5, progress: (s) => plays(s, 'blast'), condition: (s) => plays(s, 'blast') >= 5 },
  { id: 'charms-whiz', icon: '🔮', category: 'games', target: 5, progress: (s) => plays(s, 'charms'), condition: (s) => plays(s, 'charms') >= 5 },
  { id: 'reviews-100', icon: '💯', category: 'study', target: 100, progress: (s) => s.reviews, condition: (s) => s.reviews >= 100 },
  { id: 'reviews-1000', icon: '🏆', category: 'study', target: 1000, progress: (s) => s.reviews, condition: (s) => s.reviews >= 1000 },
  { id: 'mastery-50', icon: '🧠', category: 'study', target: 50, progress: (s) => s.mastered, condition: (s) => s.mastered >= 50 },
  { id: 'night-owl', icon: '🦉', category: 'special', condition: (s) => s.nightOwl },
  { id: 'early-bird', icon: '🐦', category: 'special', condition: (s) => s.earlyBird },
]

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id)

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}

/** Ids whose condition now holds and that are not yet unlocked. */
export function evaluateAchievements(stats: AchievementStats, unlocked: Iterable<string>): string[] {
  const have = new Set(unlocked)
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.condition(stats)).map((a) => a.id)
}

export function emptyAchievementStats(): AchievementStats {
  return {
    sets: 0,
    imports: 0,
    shares: 0,
    flashcardsFlipped: 0,
    studyDays: 0,
    currentStreak: 0,
    longestStreak: 0,
    reviews: 0,
    mastered: 0,
    gamePlays: {},
    nightOwl: false,
    earlyBird: false,
  }
}
