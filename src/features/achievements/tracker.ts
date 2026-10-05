import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import i18n from '@/app/i18n'
import { db } from '@/db/db'
import { now, todayKey } from '@/domain/id'
import type { Streak } from '@/domain/types'
import {
  applyStudyDay,
  emptyStreak,
  evaluateAchievements,
  hourFlags,
  type AchievementStats,
} from '@/domain/achievements'
import { parseDayKey } from '@/domain/achievements/streak'
import { toast } from '@/ui'
import { pushNotification, runDailyChecks } from '@/features/notifications'

export type AchievementEventType = 'study' | 'review' | 'game' | 'create' | 'import' | 'share'
export interface AchievementEvent {
  type: AchievementEventType
  setId?: string
  game?: string
}

const COUNTERS_KEY = 'achv.counters'
interface Counters {
  imports: number
  shares: number
}

async function getCounters(): Promise<Counters> {
  const row = await db.kv.get(COUNTERS_KEY)
  const v = (row?.value as Partial<Counters> | undefined) ?? {}
  return { imports: v.imports ?? 0, shares: v.shares ?? 0 }
}

/** Mark `day` (default today) as studied and update the streak. Idempotent. */
export async function recordStudyDay(day = todayKey()): Promise<Streak> {
  return db.transaction('rw', db.streak, async () => {
    const cur = (await db.streak.get('streak')) ?? emptyStreak()
    const next = applyStudyDay(cur, day)
    if (next !== cur) await db.streak.put(next)
    return next
  })
}

/** Add any revlog days not yet in the streak (covers study modes that forgot to call recordStudyDay). */
export async function syncStudyDaysFromRevlog(): Promise<Streak> {
  const cur = (await db.streak.get('streak')) ?? emptyStreak()
  const since = cur.lastDay ? parseDayKey(cur.lastDay).getTime() - 12 * 3_600_000 : 0
  const recent = await db.revlog.where('ts').aboveOrEqual(since).toArray()
  const days = new Set<string>(recent.map((r) => todayKey(new Date(r.ts))))
  const sessions = await db.sessions.where('startedAt').aboveOrEqual(since).toArray()
  for (const s of sessions) if (s.answers.length || s.finishedAt) days.add(todayKey(new Date(s.startedAt)))
  let next = cur
  for (const d of [...days].sort()) next = applyStudyDay(next, d)
  if (next !== cur) await db.streak.put(next)
  return next
}

export async function computeAchievementStats(): Promise<AchievementStats> {
  const [sets, revlog, progressMastered, scores, streak, counters] = await Promise.all([
    db.sets.filter((s) => !s.draft).count(),
    db.revlog.toArray(),
    db.progress.where('bucket').equals('mastered').count(),
    db.scores.toArray(),
    db.streak.get('streak'),
    getCounters(),
  ])
  const gamePlays: Record<string, number> = {}
  for (const s of scores) gamePlays[s.game] = (gamePlays[s.game] ?? 0) + s.plays
  const flags = hourFlags(revlog)
  const importedSets = await db.sets.filter((s) => !!s.externalId).count()
  return {
    sets,
    imports: Math.max(counters.imports, importedSets),
    shares: counters.shares,
    flashcardsFlipped: revlog.filter((r) => r.mode === 'flashcards').length,
    studyDays: streak?.days.length ?? 0,
    currentStreak: streak?.current ?? 0,
    longestStreak: streak?.longest ?? 0,
    reviews: revlog.length,
    mastered: progressMastered,
    gamePlays,
    nightOwl: flags.nightOwl,
    earlyBird: flags.earlyBird,
  }
}

const tl = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { ns: 'library', ...opts }) as string

/**
 * Evaluate the achievement rules and unlock what is newly earned (row + notification + toast).
 * Pass an event to bump event-only counters (import/share). Returns newly unlocked ids.
 */
export async function checkAchievements(event?: AchievementEvent): Promise<string[]> {
  if (event?.type === 'import' || event?.type === 'share') {
    const c = await getCounters()
    if (event.type === 'import') c.imports++
    else c.shares++
    await db.kv.put({ key: COUNTERS_KEY, value: c })
  }
  if (event?.type === 'study' || event?.type === 'review' || event?.type === 'game') await recordStudyDay()
  const stats = await computeAchievementStats()
  const unlocked = await db.achievements.toArray()
  const fresh = evaluateAchievements(stats, unlocked.map((a) => a.id))
  if (!fresh.length) return []
  const ts = now()
  await db.achievements.bulkPut(fresh.map((id) => ({ id, unlockedAt: ts })))
  for (const id of fresh) {
    const name = tl(`achievements.items.${id}.title`)
    await pushNotification({ type: 'achievement', title: tl('notif.achievementTitle', { name }), body: tl(`achievements.items.${id}.description`), link: '/achievements' })
    toast.success(tl('notif.achievementTitle', { name }))
  }
  return fresh
}

let inFlight: Promise<void> | null = null
async function runTracker(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      await syncStudyDaysFromRevlog()
      await checkAchievements()
      await runDailyChecks()
    } catch (e) {
      console.warn('study tracker', e)
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * Keeps streak, achievements and daily notifications up to date. Runs on mount, on window focus
 * and whenever the revlog grows. Mounted in HomePage and LibraryPage (no AppShell access).
 */
export function useStudyTracker(): void {
  const revCount = useLiveQuery(() => db.revlog.count(), [], -1)
  const scoreCount = useLiveQuery(() => db.scores.count(), [], -1)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (revCount < 0 || scoreCount < 0) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void runTracker(), 400)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [revCount, scoreCount])
  useEffect(() => {
    const onFocus = () => void runTracker()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])
}
