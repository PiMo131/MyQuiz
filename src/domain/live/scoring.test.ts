import { describe, expect, it } from 'vitest'
import { answerPoints, basePoints, matchPoints, streakBonus } from './scoring'

describe('live scoring', () => {
  it('base points scale with remaining time', () => {
    expect(basePoints(20_000, 20_000)).toBe(1000)
    expect(basePoints(10_000, 20_000)).toBe(500)
    expect(basePoints(0, 20_000)).toBe(100) // floor for a correct answer
    expect(basePoints(5_000, 0)).toBe(1000) // no limit
    expect(basePoints(-5, 20_000)).toBe(100)
  })
  it('streak bonus is +100 per consecutive correct, capped', () => {
    expect(streakBonus(0)).toBe(0)
    expect(streakBonus(1)).toBe(0)
    expect(streakBonus(2)).toBe(100)
    expect(streakBonus(4)).toBe(300)
    expect(streakBonus(20)).toBe(500)
  })
  it('answer points combine base, streak and double', () => {
    expect(answerPoints({ correct: false, remainingMs: 1, limitMs: 1, streakAfter: 3, doubled: true })).toBe(0)
    expect(answerPoints({ correct: true, remainingMs: 20_000, limitMs: 20_000, streakAfter: 1, doubled: false })).toBe(1000)
    expect(answerPoints({ correct: true, remainingMs: 10_000, limitMs: 20_000, streakAfter: 3, doubled: false })).toBe(700)
    expect(answerPoints({ correct: true, remainingMs: 10_000, limitMs: 20_000, streakAfter: 3, doubled: true })).toBe(1400)
  })
  it('match points reward pairs and speed', () => {
    expect(matchPoints(3, 10_000, false)).toBe(300)
    expect(matchPoints(6, 30_000, true)).toBe(600 + 1500)
    expect(matchPoints(6, 400_000, true)).toBe(600)
  })
})
