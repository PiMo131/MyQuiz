import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, emptyAchievementStats, evaluateAchievements } from './rules'

describe('achievement rules', () => {
  it('has unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
  })
  it('unlocks nothing for an empty profile', () => {
    expect(evaluateAchievements(emptyAchievementStats(), [])).toEqual([])
  })
  it('unlocks first-set and active-learner', () => {
    const s = { ...emptyAchievementStats(), sets: 1, studyDays: 3 }
    expect(evaluateAchievements(s, [])).toEqual(['first-set', 'active-learner'])
  })
  it('skips already unlocked ids', () => {
    const s = { ...emptyAchievementStats(), sets: 2 }
    expect(evaluateAchievements(s, ['first-set'])).toEqual([])
  })
  it('streak thresholds use the longest streak', () => {
    const s = { ...emptyAchievementStats(), longestStreak: 30 }
    expect(evaluateAchievements(s, [])).toEqual(['committed-learner', 'streak-30'])
  })
  it('game whiz needs 5 plays of that game', () => {
    const s = { ...emptyAchievementStats(), gamePlays: { match: 5, blocks: 4 } }
    expect(evaluateAchievements(s, [])).toEqual(['match-whiz'])
  })
  it('special flags', () => {
    const s = { ...emptyAchievementStats(), nightOwl: true, earlyBird: true, reviews: 1000, mastered: 50, flashcardsFlipped: 100, imports: 1, shares: 1 }
    const ids = evaluateAchievements(s, [])
    expect(ids).toEqual(expect.arrayContaining(['night-owl', 'early-bird', 'reviews-100', 'reviews-1000', 'mastery-50', 'flashcard-whiz', 'importer', 'sharer']))
  })
})
