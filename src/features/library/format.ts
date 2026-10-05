import { todayKey } from '@/domain/id'
import { addDays } from '@/domain/achievements'

/** "2 hours ago" / "2 uur geleden" via Intl, with a sane fallback. */
export function timeAgo(ts: number | undefined, locale: string, now = Date.now()): string {
  if (!ts) return ''
  const diff = ts - now
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour
  if (abs < min) return rtf.format(0, 'second').replace(/^in 0 seconds$|^over 0 seconden$/, locale.startsWith('nl') ? 'zojuist' : 'just now')
  if (abs < hour) return rtf.format(Math.round(diff / min), 'minute')
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour')
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), 'day')
  if (abs < 365 * day) return rtf.format(Math.round(diff / (30 * day)), 'month')
  return rtf.format(Math.round(diff / (365 * day)), 'year')
}

export type RecencyGroup = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'earlier'
export const RECENCY_ORDER: RecencyGroup[] = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'earlier']

export function recencyGroup(ts: number, now = Date.now()): RecencyGroup {
  const key = todayKey(new Date(ts))
  const today = todayKey(new Date(now))
  if (key === today) return 'today'
  if (key === addDays(today, -1)) return 'yesterday'
  if (key >= addDays(today, -6)) return 'thisWeek'
  if (key >= addDays(today, -29)) return 'thisMonth'
  return 'earlier'
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function formatDate(ts: number, locale: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Intl.DateTimeFormat(locale, opts).format(new Date(ts))
}
