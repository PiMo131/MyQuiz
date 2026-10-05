import type { Bucket, Progress, RevlogEntry, Session, StudySet } from '@/domain/types'
import { todayKey } from '@/domain/id'
import { addDays, parseDayKey } from './streak'

export const DAY_MS = 86_400_000

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// ---------- Heatmap ----------
export interface HeatCell {
  day: string // YYYY-MM-DD
  count: number
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

/** Count reviews per local day key. */
export function reviewsByDay(revlog: Pick<RevlogEntry, 'ts'>[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of revlog) {
    const k = todayKey(new Date(r.ts))
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export function heatLevel(count: number, max: number): HeatCell['level'] {
  if (count <= 0) return 0
  if (max <= 1) return 4
  const r = count / max
  if (r <= 0.25) return 1
  if (r <= 0.5) return 2
  if (r <= 0.75) return 3
  return 4
}

/**
 * Last `weeks` weeks as a grid of columns (weeks) × 7 rows (Mon..Sun), ending with the current week.
 * Days after `today` are flagged `future`.
 */
export function heatmapWeeks(revlog: Pick<RevlogEntry, 'ts'>[], weeks = 26, today = todayKey()): HeatCell[][] {
  const byDay = reviewsByDay(revlog)
  const todayDate = parseDayKey(today)
  const dow = (todayDate.getDay() + 6) % 7 // Mon = 0
  const endOfWeek = addDays(today, 6 - dow)
  const start = addDays(endOfWeek, -(weeks * 7 - 1))
  const max = Math.max(0, ...byDay.values())
  const cols: HeatCell[][] = []
  let cursor = start
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let d = 0; d < 7; d++) {
      const count = byDay.get(cursor) ?? 0
      col.push({ day: cursor, count, level: heatLevel(count, max), future: cursor > today })
      cursor = addDays(cursor, 1)
    }
    cols.push(col)
  }
  return cols
}

// ---------- Forecast ----------
export interface ForecastBar {
  day: string
  count: number
}

/** Number of review cards becoming due per day for the next `days` days (overdue counted on day 0). */
export function dueForecast(progress: Pick<Progress, 'fsrs'>[], days: number, now = Date.now()): ForecastBar[] {
  const start = startOfDay(now)
  const bars: ForecastBar[] = Array.from({ length: days }, (_, i) => ({ day: todayKey(new Date(start + i * DAY_MS)), count: 0 }))
  for (const p of progress) {
    if (p.fsrs.state === 0) continue
    const idx = Math.floor((startOfDay(p.fsrs.due) - start) / DAY_MS)
    const slot = Math.max(0, idx)
    if (slot < days) bars[slot].count++
  }
  return bars
}

// ---------- Retention & volume ----------
export interface RetentionStats {
  total: number
  correct: number
  percent: number | null // null when no data
}

export function retention(revlog: Pick<RevlogEntry, 'ts' | 'rating'>[], days = 30, now = Date.now()): RetentionStats {
  const since = now - days * DAY_MS
  let total = 0
  let correct = 0
  for (const r of revlog) {
    if (r.ts < since) continue
    total++
    if (r.rating >= 3) correct++
  }
  return { total, correct, percent: total ? Math.round((correct / total) * 100) : null }
}

export function reviewsPerDay(revlog: Pick<RevlogEntry, 'ts'>[], days = 30, now = Date.now()): ForecastBar[] {
  const start = startOfDay(now) - (days - 1) * DAY_MS
  const bars: ForecastBar[] = Array.from({ length: days }, (_, i) => ({ day: todayKey(new Date(start + i * DAY_MS)), count: 0 }))
  for (const r of revlog) {
    const idx = Math.floor((startOfDay(r.ts) - start) / DAY_MS)
    if (idx >= 0 && idx < days) bars[idx].count++
  }
  return bars
}

/** Total study time in ms: sum of revlog durations, falling back to session durations where revlog has none. */
export function timeStudiedMs(revlog: Pick<RevlogEntry, 'durationMs'>[], sessions: Pick<Session, 'startedAt' | 'finishedAt'>[] = []): number {
  const fromLog = revlog.reduce((a, r) => a + Math.max(0, Math.min(r.durationMs || 0, 10 * 60_000)), 0)
  if (fromLog > 0) return fromLog
  return sessions.reduce((a, s) => a + (s.finishedAt ? Math.max(0, Math.min(s.finishedAt - s.startedAt, 6 * 3_600_000)) : 0), 0)
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} u ${m} min` : `${h} u`
}

// ---------- Mastery ----------
export type BucketCounts = Record<Bucket, number>

export function emptyBuckets(): BucketCounts {
  return { new: 0, learning: 0, known: 0, mastered: 0 }
}

export function bucketCounts(progress: Pick<Progress, 'bucket'>[], totalCards?: number): BucketCounts {
  const b = emptyBuckets()
  for (const p of progress) b[p.bucket]++
  if (totalCards !== undefined) {
    const seen = progress.length
    b.new += Math.max(0, totalCards - seen)
  }
  return b
}

/** 0..100: share of cards that are known or mastered. */
export function masteryPercent(b: BucketCounts): number {
  const total = b.new + b.learning + b.known + b.mastered
  if (!total) return 0
  return Math.round(((b.known + b.mastered) / total) * 100)
}

export interface SetMasteryRow {
  set: StudySet
  cards: number
  buckets: BucketCounts
  mastery: number
}

export function setMasteryTable(sets: StudySet[], cardCounts: Map<string, number>, progress: Pick<Progress, 'setId' | 'bucket' | 'variant'>[]): SetMasteryRow[] {
  const bySet = new Map<string, Pick<Progress, 'bucket'>[]>()
  for (const p of progress) {
    if (p.variant !== 'forward') continue
    const arr = bySet.get(p.setId) ?? []
    arr.push(p)
    bySet.set(p.setId, arr)
  }
  return sets
    .map((set) => {
      const cards = cardCounts.get(set.id) ?? 0
      const buckets = bucketCounts(bySet.get(set.id) ?? [], cards)
      return { set, cards, buckets, mastery: masteryPercent(buckets) }
    })
    .sort((a, b) => b.mastery - a.mastery || a.set.title.localeCompare(b.set.title))
}

// ---------- Interval histogram ----------
export interface HistogramBin {
  label: string
  min: number // inclusive, days
  max: number // exclusive, days (Infinity for last)
  count: number
}

const INTERVAL_BINS: Array<[string, number, number]> = [
  ['<1d', 0, 1],
  ['1-3d', 1, 4],
  ['4-7d', 4, 8],
  ['1-2w', 8, 15],
  ['2-4w', 15, 31],
  ['1-3m', 31, 91],
  ['3m+', 91, Infinity],
]

export function intervalHistogram(progress: Pick<Progress, 'fsrs'>[]): HistogramBin[] {
  const bins: HistogramBin[] = INTERVAL_BINS.map(([label, min, max]) => ({ label, min, max, count: 0 }))
  for (const p of progress) {
    if (p.fsrs.state === 0) continue
    const d = p.fsrs.scheduled_days
    const bin = bins.find((b) => d >= b.min && d < b.max)
    if (bin) bin.count++
  }
  return bins
}

// ---------- Achievement input ----------
export interface AchievementStats {
  sets: number
  imports: number
  shares: number
  flashcardsFlipped: number
  studyDays: number
  currentStreak: number
  longestStreak: number
  reviews: number
  mastered: number
  gamePlays: Record<string, number> // game id -> plays
  nightOwl: boolean // studied between 00:00 and 04:00
  earlyBird: boolean // studied between 05:00 and 07:59
}

export function hourFlags(revlog: Pick<RevlogEntry, 'ts'>[]): { nightOwl: boolean; earlyBird: boolean } {
  let nightOwl = false
  let earlyBird = false
  for (const r of revlog) {
    const h = new Date(r.ts).getHours()
    if (h < 4) nightOwl = true
    else if (h >= 5 && h < 8) earlyBird = true
    if (nightOwl && earlyBird) break
  }
  return { nightOwl, earlyBird }
}
