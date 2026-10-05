import { describe, expect, it } from 'vitest'
import { applyRating, bucketFor, dailyPlan, emptyFsrsState, makeScheduler, previewRatings } from './srs'
import type { Progress } from './types'

describe('srs', () => {
  const f = makeScheduler({ enableFuzz: false })
  const now = Date.UTC(2026, 9, 5, 10, 0, 0)

  it('previews four outcomes with increasing intervals', () => {
    const s = emptyFsrsState(now)
    const p = previewRatings(f, s, now)
    expect(p.map((x) => x.rating)).toEqual([1, 2, 3, 4])
    expect(p[0].due).toBeLessThanOrEqual(p[1].due)
    expect(p[2].due).toBeLessThanOrEqual(p[3].due)
    expect(p[3].intervalDays).toBeGreaterThanOrEqual(1)
  })

  it('applies a rating and moves the card out of New', () => {
    const s = emptyFsrsState(now)
    const out = applyRating(f, s, 3, now)
    expect(out.fsrs.reps).toBe(1)
    expect(out.fsrs.state).not.toBe(0)
    expect(out.bucket).not.toBe('new')
  })

  it('detects leeches after repeated lapses', () => {
    let s = emptyFsrsState(now)
    let t = now
    s = applyRating(f, s, 4, t).fsrs
    let leech = false
    for (let i = 0; i < 24; i++) {
      t = s.due + 1000
      // lapses only count when failing a Review-state card; alternate Good/Again
      const o = applyRating(f, s, s.state === 2 ? 1 : 3, t, { leechThreshold: 3 })
      s = o.fsrs
      leech = leech || o.leech
    }
    expect(leech).toBe(true)
  })

  it('builds a daily plan limited by newPerDay', () => {
    const mk = (i: number): Progress => ({
      id: `c${i}:forward`,
      cardId: `c${i}`,
      setId: 's',
      variant: 'forward',
      fsrs: emptyFsrsState(now),
      bucket: 'new',
      correct: 0,
      incorrect: 0,
      updatedAt: now,
    })
    const all = Array.from({ length: 30 }, (_, i) => mk(i))
    const plan = dailyPlan(all, { newPerDay: 5 }, now)
    expect(plan.fresh).toHaveLength(5)
    expect(plan.due).toHaveLength(0)
  })
})

describe('bucketFor', () => {
  const base = emptyFsrsState(0)
  it('new → new, review → known, long review → mastered', () => {
    expect(bucketFor(base)).toBe('new')
    expect(bucketFor({ ...base, state: 2, reps: 3, stability: 5, scheduled_days: 5 })).toBe('known')
    expect(bucketFor({ ...base, state: 2, reps: 9, stability: 30, scheduled_days: 25 })).toBe('mastered')
  })
  it('learning state is known only with ≥2 correct and no mistakes', () => {
    const learning = { ...base, state: 1 as const, reps: 2 }
    expect(bucketFor(learning)).toBe('learning')
    expect(bucketFor(learning, 2, 0)).toBe('known')
    expect(bucketFor(learning, 2, 1)).toBe('learning')
    expect(bucketFor(learning, 1, 0)).toBe('learning')
  })
})
