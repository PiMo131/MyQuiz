import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayKey } from '@/domain/id'
import { cn } from '@/ui'

/** Month calendar (Mon-first) with a flame on studied days. */
export function StreakCalendar({ days }: { days: string[] }) {
  const { t, i18n } = useTranslation('library')
  const today = todayKey()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const studied = useMemo(() => new Set(days), [days])
  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1)
    const lead = (first.getDay() + 6) % 7
    const start = new Date(cursor.y, cursor.m, 1 - lead)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12)
      const key = todayKey(d)
      return { key, day: d.getDate(), inMonth: d.getMonth() === cursor.m, studied: studied.has(key), today: key === today, future: key > today }
    })
  }, [cursor, studied, today])
  const monthLabel = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(new Date(cursor.y, cursor.m, 1))
  const isCurrent = cursor.y === Number(today.slice(0, 4)) && cursor.m === Number(today.slice(5, 7)) - 1
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' })
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i, 12))) // 2024-01-01 is a Monday
  }, [i18n.language])
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold capitalize">{monthLabel}</h3>
        <div className="flex gap-1">
          <button onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))} aria-label={t('achievements.prevMonth')} className="rounded-lg border border-border p-1.5 hover:bg-surface-2"><ChevronLeft size={16} /></button>
          <button onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))} disabled={isCurrent} aria-label={t('achievements.nextMonth')} className="rounded-lg border border-border p-1.5 hover:bg-surface-2 disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-faint">
        {weekdays.map((w, i) => <div key={i}>{w}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((c) => (
          <div
            key={c.key}
            title={c.studied ? t('achievements.studiedOn', { date: c.key }) : c.key}
            className={cn(
              'relative grid aspect-square place-items-center rounded-lg text-sm tabular-nums',
              !c.inMonth && 'text-faint/60',
              c.inMonth && !c.studied && 'text-text',
              c.future && 'text-faint/60',
              c.studied && 'bg-highlight-soft font-bold text-highlight',
              c.today && 'ring-2 ring-primary',
            )}
          >
            {c.studied ? <span aria-hidden className="absolute -top-1 text-base leading-none">🔥</span> : null}
            <span className={cn(c.studied && 'mt-2 text-xs')}>{c.day}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
