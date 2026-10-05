import { describe, expect, it } from 'vitest'
import { bucketCounts, dueForecast, heatLevel, heatmapWeeks, hourFlags, intervalHistogram, masteryPercent, retention, reviewsByDay, reviewsPerDay, setMasteryTable, timeStudiedMs } from './stats'
import type { FsrsState, StudySet } from '@/domain/types'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
const fsrs = (over: Partial<FsrsState>): FsrsState => ({ due: 0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 2, ...over })

describe('heatmap', () => {
  it('buckets reviews per local day', () => {
    const m = reviewsByDay([{ ts: at(2026, 10, 5, 1) }, { ts: at(2026, 10, 5, 23) }, { ts: at(2026, 10, 4) }])
    expect(m.get('2026-10-05')).toBe(2)
    expect(m.get('2026-10-04')).toBe(1)
  })
  it('levels scale against the max', () => {
    expect(heatLevel(0, 10)).toBe(0)
    expect(heatLevel(1, 10)).toBe(1)
    expect(heatLevel(5, 10)).toBe(2)
    expect(heatLevel(7, 10)).toBe(3)
    expect(heatLevel(10, 10)).toBe(4)
    expect(heatLevel(1, 1)).toBe(4)
  })
  it('builds a Monday-first grid ending with the current week', () => {
    // 2026-10-05 is a Monday
    const grid = heatmapWeeks([{ ts: at(2026, 10, 5) }, { ts: at(2026, 10, 5) }, { ts: at(2026, 9, 30) }], 2, '2026-10-05')
    expect(grid).toHaveLength(2)
    expect(grid[0]).toHaveLength(7)
    expect(grid[0][0].day).toBe('2026-09-28')
    expect(grid[1][0].day).toBe('2026-10-05')
    expect(grid[1][0].count).toBe(2)
    expect(grid[1][0].level).toBe(4)
    expect(grid[1][1].future).toBe(true)
    expect(grid[0][2].count).toBe(1)
    expect(grid[1][6].day).toBe('2026-10-11')
  })
})

describe('forecast', () => {
  it('counts due cards per day with overdue on day 0', () => {
    const now = at(2026, 10, 5, 10)
    const bars = dueForecast(
      [
        { fsrs: fsrs({ due: at(2026, 10, 1) }) },
        { fsrs: fsrs({ due: at(2026, 10, 5, 20) }) },
        { fsrs: fsrs({ due: at(2026, 10, 7) }) },
        { fsrs: fsrs({ due: at(2026, 10, 7), state: 0 }) },
        { fsrs: fsrs({ due: at(2026, 11, 7) }) },
      ],
      7,
      now,
    )
    expect(bars.map((b) => b.count)).toEqual([2, 0, 1, 0, 0, 0, 0])
    expect(bars[0].day).toBe('2026-10-05')
  })
})

describe('retention and volume', () => {
  it('computes retention over the window', () => {
    const now = at(2026, 10, 5)
    const r = retention([{ ts: now - 1000, rating: 3 }, { ts: now - 2000, rating: 1 }, { ts: now - 40 * 86_400_000, rating: 1 }], 30, now)
    expect(r).toEqual({ total: 2, correct: 1, percent: 50 })
    expect(retention([], 30, now).percent).toBeNull()
  })
  it('reviews per day over the window', () => {
    const now = at(2026, 10, 5)
    const bars = reviewsPerDay([{ ts: now }, { ts: now - 86_400_000 }, { ts: now - 10 * 86_400_000 }], 7, now)
    expect(bars[6].count).toBe(1)
    expect(bars[5].count).toBe(1)
    expect(bars.reduce((a, b) => a + b.count, 0)).toBe(2)
  })
  it('time studied prefers revlog, falls back to sessions', () => {
    expect(timeStudiedMs([{ durationMs: 1000 }, { durationMs: 2000 }])).toBe(3000)
    expect(timeStudiedMs([], [{ startedAt: 0, finishedAt: 60_000 }])).toBe(60_000)
  })
  it('hour flags', () => {
    expect(hourFlags([{ ts: at(2026, 10, 5, 2) }])).toEqual({ nightOwl: true, earlyBird: false })
    expect(hourFlags([{ ts: at(2026, 10, 5, 6) }])).toEqual({ nightOwl: false, earlyBird: true })
  })
})

describe('mastery', () => {
  it('counts buckets and fills unseen cards as new', () => {
    const b = bucketCounts([{ bucket: 'mastered' }, { bucket: 'known' }, { bucket: 'learning' }], 10)
    expect(b).toEqual({ new: 7, learning: 1, known: 1, mastered: 1 })
    expect(masteryPercent(b)).toBe(20)
    expect(masteryPercent({ new: 0, learning: 0, known: 0, mastered: 0 })).toBe(0)
  })
  it('builds the per-set table sorted by mastery', () => {
    const set = (id: string, title: string): StudySet => ({ id, title, description: '', tags: [], lang: { term: '', definition: '' }, cardTypes: ['basic'], visibility: 'private', createdAt: 0, updatedAt: 0 })
    const rows = setMasteryTable(
      [set('a', 'A'), set('b', 'B')],
      new Map([['a', 2], ['b', 2]]),
      [
        { setId: 'a', bucket: 'mastered', variant: 'forward' },
        { setId: 'a', bucket: 'mastered', variant: 'reverse' },
        { setId: 'b', bucket: 'known', variant: 'forward' },
        { setId: 'b', bucket: 'known', variant: 'forward' },
      ],
    )
    expect(rows[0].set.id).toBe('b')
    expect(rows[0].mastery).toBe(100)
    expect(rows[1].mastery).toBe(50)
  })
  it('interval histogram ignores new cards', () => {
    const h = intervalHistogram([{ fsrs: fsrs({ scheduled_days: 0 }) }, { fsrs: fsrs({ scheduled_days: 2 }) }, { fsrs: fsrs({ scheduled_days: 400 }) }, { fsrs: fsrs({ scheduled_days: 5, state: 0 }) }])
    expect(h.map((b) => b.count)).toEqual([1, 1, 0, 0, 0, 0, 1])
  })
})
