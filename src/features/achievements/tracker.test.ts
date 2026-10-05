import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/db'
import { todayKey } from '@/domain/id'
import { addDays } from '@/domain/achievements'

vi.mock('@/app/i18n', () => ({ default: { t: (k: string) => k, language: 'en' } }))
vi.mock('@/ui', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

const { recordStudyDay, checkAchievements, syncStudyDaysFromRevlog, computeAchievementStats } = await import('./tracker')

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('tracker', () => {
  it('recordStudyDay creates and extends the streak', async () => {
    const today = todayKey()
    await recordStudyDay(addDays(today, -1))
    const s = await recordStudyDay(today)
    expect(s.current).toBe(2)
    expect((await db.streak.get('streak'))?.days).toHaveLength(2)
  })

  it('syncs study days from revlog', async () => {
    const t = Date.now()
    await db.revlog.add({ cardId: 'c', setId: 's', variant: 'forward', ts: t, rating: 3, state: 2, scheduledDays: 1, elapsedDays: 0, durationMs: 0, mode: 'srs' })
    await db.revlog.add({ cardId: 'c', setId: 's', variant: 'forward', ts: t - 86_400_000, rating: 3, state: 2, scheduledDays: 1, elapsedDays: 0, durationMs: 0, mode: 'srs' })
    const s = await syncStudyDaysFromRevlog()
    expect(s.current).toBe(2)
    expect(s.lastDay).toBe(todayKey())
  })

  it('unlocks achievements once and notifies', async () => {
    await db.sets.put({ id: 'a', title: 'A', description: '', tags: [], lang: { term: '', definition: '' }, cardTypes: ['basic'], visibility: 'private', createdAt: 0, updatedAt: 0 })
    const first = await checkAchievements()
    expect(first).toEqual(['first-set'])
    expect(await db.achievements.count()).toBe(1)
    expect(await db.notifications.count()).toBe(1)
    const second = await checkAchievements()
    expect(second).toEqual([])
    expect(await db.achievements.count()).toBe(1)
  })

  it('bumps import/share counters from events', async () => {
    await checkAchievements({ type: 'import' })
    await checkAchievements({ type: 'share' })
    const stats = await computeAchievementStats()
    expect(stats.imports).toBe(1)
    expect(stats.shares).toBe(1)
    const ids = (await db.achievements.toArray()).map((a) => a.id).sort()
    expect(ids).toEqual(['importer', 'sharer'])
  })

  it('counts game plays from the scores table', async () => {
    await db.scores.put({ id: 's:match', setId: 's', game: 'match', best: 1, plays: 5, updatedAt: 0 })
    const ids = await checkAchievements({ type: 'game', game: 'match' })
    expect(ids).toContain('match-whiz')
    expect((await db.streak.get('streak'))?.current).toBe(1)
  })
})
