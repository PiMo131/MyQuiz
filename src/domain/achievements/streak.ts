import type { Streak } from '@/domain/types'
import { todayKey } from '@/domain/id'

export const MAX_STREAK_DAYS = 400

export function emptyStreak(): Streak {
  return { id: 'streak', current: 0, longest: 0, lastDay: '', days: [] }
}

/** Parse YYYY-MM-DD as a local date at noon (avoids DST edge cases). */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12)
}

export function addDays(key: string, n: number): string {
  const d = parseDayKey(key)
  d.setDate(d.getDate() + n)
  return todayKey(d)
}

/** Whole days between two day keys (b - a). */
export function dayDiff(a: string, b: string): number {
  const ms = parseDayKey(b).getTime() - parseDayKey(a).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * Register a studied day. Idempotent for the same day. The streak continues when `day`
 * directly follows `lastDay`; a missed day resets it to 1. Past days (backfill) are added to
 * `days` but do not change the counters.
 */
export function applyStudyDay(streak: Streak, day: string): Streak {
  if (streak.days.includes(day)) return streak
  const days = [...streak.days, day].sort().slice(-MAX_STREAK_DAYS)
  if (streak.lastDay && dayDiff(streak.lastDay, day) <= 0) {
    // Backfill of an older day: recompute from the day list to stay consistent.
    return rebuildStreak(days)
  }
  const current = streak.lastDay && dayDiff(streak.lastDay, day) === 1 ? streak.current + 1 : 1
  return { id: 'streak', current, longest: Math.max(streak.longest, current), lastDay: day, days }
}

/** Rebuild counters purely from a list of studied day keys. */
export function rebuildStreak(daysIn: string[]): Streak {
  const days = [...new Set(daysIn)].sort().slice(-MAX_STREAK_DAYS)
  let current = 0
  let longest = 0
  let prev = ''
  for (const d of days) {
    current = prev && dayDiff(prev, d) === 1 ? current + 1 : 1
    longest = Math.max(longest, current)
    prev = d
  }
  return { id: 'streak', current, longest, lastDay: prev, days }
}

/**
 * The streak as it stands on `today`: still alive if the user studied today or yesterday,
 * otherwise 0 (the stored counter is stale until the next study day).
 */
export function effectiveStreak(streak: Streak, today = todayKey()): number {
  if (!streak.lastDay) return 0
  const gap = dayDiff(streak.lastDay, today)
  return gap <= 1 ? streak.current : 0
}

/** True when there is a live streak that will break unless the user studies today. */
export function isStreakAtRisk(streak: Streak, today = todayKey()): boolean {
  return !!streak.lastDay && dayDiff(streak.lastDay, today) === 1 && streak.current > 0
}

export function studiedToday(streak: Streak, today = todayKey()): boolean {
  return streak.lastDay === today
}

/** Monday-based ISO week key, e.g. 2026-W41. */
export function weekKey(day: string): string {
  const d = parseDayKey(day)
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(tmp.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((tmp.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Consecutive weeks (ending this week or last week) with at least one study day. */
export function weeklyStreak(days: string[], today = todayKey()): number {
  const weeks = new Set(days.map(weekKey))
  let cursor = today
  if (!weeks.has(weekKey(cursor))) {
    cursor = addDays(cursor, -7)
    if (!weeks.has(weekKey(cursor))) return 0
  }
  let n = 0
  while (weeks.has(weekKey(cursor))) {
    n++
    cursor = addDays(cursor, -7)
  }
  return n
}
