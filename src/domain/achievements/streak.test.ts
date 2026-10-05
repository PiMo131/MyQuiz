import { describe, expect, it } from 'vitest'
import { applyStudyDay, effectiveStreak, emptyStreak, isStreakAtRisk, rebuildStreak, weeklyStreak, weekKey, dayDiff, addDays } from './streak'

describe('streak', () => {
  it('starts a streak on the first day', () => {
    const s = applyStudyDay(emptyStreak(), '2026-10-05')
    expect(s).toMatchObject({ current: 1, longest: 1, lastDay: '2026-10-05', days: ['2026-10-05'] })
  })
  it('is idempotent for the same day', () => {
    const s1 = applyStudyDay(emptyStreak(), '2026-10-05')
    expect(applyStudyDay(s1, '2026-10-05')).toBe(s1)
  })
  it('continues on consecutive days and resets after a missed day', () => {
    let s = emptyStreak()
    s = applyStudyDay(s, '2026-10-01')
    s = applyStudyDay(s, '2026-10-02')
    s = applyStudyDay(s, '2026-10-03')
    expect(s.current).toBe(3)
    s = applyStudyDay(s, '2026-10-05')
    expect(s.current).toBe(1)
    expect(s.longest).toBe(3)
    expect(s.days).toHaveLength(4)
  })
  it('handles month boundaries', () => {
    let s = applyStudyDay(emptyStreak(), '2026-01-31')
    s = applyStudyDay(s, '2026-02-01')
    expect(s.current).toBe(2)
  })
  it('backfills older days without breaking the counters', () => {
    let s = applyStudyDay(emptyStreak(), '2026-10-04')
    s = applyStudyDay(s, '2026-10-05')
    s = applyStudyDay(s, '2026-10-03')
    expect(s.current).toBe(3)
    expect(s.lastDay).toBe('2026-10-05')
  })
  it('rebuilds from a day list', () => {
    const s = rebuildStreak(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-05'])
    expect(s).toMatchObject({ current: 2, longest: 2, lastDay: '2026-10-05' })
    expect(s.days).toHaveLength(4)
  })
  it('effective streak drops to 0 after two missed days', () => {
    const s = rebuildStreak(['2026-10-01', '2026-10-02'])
    expect(effectiveStreak(s, '2026-10-02')).toBe(2)
    expect(effectiveStreak(s, '2026-10-03')).toBe(2)
    expect(effectiveStreak(s, '2026-10-04')).toBe(0)
  })
  it('detects a streak at risk', () => {
    const s = rebuildStreak(['2026-10-04'])
    expect(isStreakAtRisk(s, '2026-10-05')).toBe(true)
    expect(isStreakAtRisk(s, '2026-10-04')).toBe(false)
    expect(isStreakAtRisk(s, '2026-10-07')).toBe(false)
  })
  it('computes weekly streaks', () => {
    expect(weekKey('2026-10-05')).toBe('2026-W41')
    expect(weeklyStreak(['2026-09-23', '2026-10-01', '2026-10-05'], '2026-10-05')).toBe(3)
    expect(weeklyStreak(['2026-09-23'], '2026-10-05')).toBe(0)
    expect(weeklyStreak(['2026-09-30'], '2026-10-05')).toBe(1)
  })
  it('day helpers', () => {
    expect(dayDiff('2026-03-28', '2026-03-30')).toBe(2)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
