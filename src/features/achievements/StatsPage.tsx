import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Clock, Flame, Percent, Repeat, Trophy } from 'lucide-react'
import { db } from '@/db/db'
import {
  dueForecast, effectiveStreak, emptyStreak, formatDuration, heatmapWeeks, intervalHistogram, retention, reviewsPerDay, setMasteryTable, timeStudiedMs, type ForecastBar, type HeatCell, type HistogramBin,
} from '@/domain/achievements'
import { Ring, Tabs, cn } from '@/ui'
import { formatDate } from '@/features/library'

const LEVEL_CLASS: Record<HeatCell['level'], string> = {
  0: 'bg-surface-2',
  1: 'bg-primary/25',
  2: 'bg-primary/45',
  3: 'bg-primary/70',
  4: 'bg-primary',
}

function StatTile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
        <div className="truncate text-xl font-bold tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
    </div>
  )
}

/** Simple SVG bar chart using theme tokens. */
function Bars({ bars, labelEvery = 1, formatLabel, ariaLabel }: { bars: Array<{ label: string; count: number }>; labelEvery?: number; formatLabel?: (l: string, i: number) => string; ariaLabel: string }) {
  const w = 600
  const h = 160
  const pad = { l: 28, r: 4, t: 8, b: 22 }
  const max = Math.max(1, ...bars.map((b) => b.count))
  const bw = (w - pad.l - pad.r) / bars.length
  const ticks = [0, Math.ceil(max / 2), max]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" role="img" aria-label={ariaLabel}>
      {ticks.map((tk) => {
        const y = pad.t + (h - pad.t - pad.b) * (1 - tk / max)
        return (
          <g key={tk}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="var(--color-border)" strokeDasharray="2 3" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="var(--color-text-faint)">{tk}</text>
          </g>
        )
      })}
      {bars.map((b, i) => {
        const bh = ((h - pad.t - pad.b) * b.count) / max
        const x = pad.l + i * bw + bw * 0.15
        const y = h - pad.b - bh
        return (
          <g key={b.label}>
            <rect x={x} y={y} width={bw * 0.7} height={bh} rx={3} fill="var(--color-primary)" opacity={b.count ? 0.9 : 0.25}>
              <title>{`${b.label}: ${b.count}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={x + bw * 0.35} y={h - 6} textAnchor="middle" fontSize="10" fill="var(--color-text-muted)">{formatLabel ? formatLabel(b.label, i) : b.label}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function StatsPage() {
  const { t, i18n } = useTranslation('library')
  const revlog = useLiveQuery(() => db.revlog.toArray(), [])
  const progress = useLiveQuery(() => db.progress.toArray(), [])
  const sets = useLiveQuery(() => db.sets.filter((s) => !s.draft).toArray(), [])
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const cardSetIds = useLiveQuery(() => db.cards.orderBy('setId').keys() as Promise<string[]>, [])
  const streak = useLiveQuery(() => db.streak.get('streak'), []) ?? emptyStreak()
  const [forecastDays, setForecastDays] = useState<'7' | '30'>('7')
  const [hover, setHover] = useState<HeatCell | null>(null)

  const heat = useMemo(() => heatmapWeeks(revlog ?? [], 26), [revlog])
  const forecast = useMemo(() => dueForecast(progress ?? [], Number(forecastDays)), [progress, forecastDays])
  const ret = useMemo(() => retention(revlog ?? [], 30), [revlog])
  const perDay = useMemo(() => reviewsPerDay(revlog ?? [], 30), [revlog])
  const time = useMemo(() => timeStudiedMs(revlog ?? [], sessions ?? []), [revlog, sessions])
  const hist = useMemo(() => intervalHistogram(progress ?? []), [progress])
  const table = useMemo(() => {
    const counts = new Map<string, number>()
    for (const id of cardSetIds ?? []) counts.set(id, (counts.get(id) ?? 0) + 1)
    return setMasteryTable(sets ?? [], counts, progress ?? [])
  }, [sets, cardSetIds, progress])
  const last30 = perDay.reduce((a, b) => a + b.count, 0)
  const monthLabels = useMemo(() => {
    const out: Array<{ col: number; label: string }> = []
    let prev = ''
    heat.forEach((col, i) => {
      const m = col[0].day.slice(0, 7)
      if (m !== prev) {
        out.push({ col: i, label: new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(new Date(col[0].day)) })
        prev = m
      }
    })
    return out
  }, [heat, i18n.language])
  const dayShort = (d: string) => new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(new Date(d + 'T12:00'))

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('stats.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('stats.subtitle')}</p>
        </div>
        <Link to="/achievements" className="text-sm font-semibold text-primary hover:underline">{t('common:nav.achievements')} →</Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={<Repeat size={18} />} label={t('stats.reviews30')} value={String(last30)} hint={t('stats.total', { count: revlog?.length ?? 0 })} />
        <StatTile icon={<Percent size={18} />} label={t('stats.retention')} value={ret.percent === null ? '—' : `${ret.percent}%`} hint={t('stats.retentionHint', { correct: ret.correct, total: ret.total })} />
        <StatTile icon={<Clock size={18} />} label={t('stats.timeStudied')} value={formatDuration(time)} />
        <StatTile icon={<Flame size={18} />} label={t('stats.streak')} value={String(effectiveStreak(streak))} hint={t('achievements.longest', { count: streak.longest })} />
      </div>

      <section className="card mt-6 p-5" aria-label={t('stats.heatmap')}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{t('stats.heatmap')}</h2>
          <span className="text-xs text-muted">{hover ? `${formatDate(new Date(hover.day + 'T12:00').getTime(), i18n.language)}: ${t('stats.reviewsCount', { count: hover.count })}` : t('stats.heatmapHint')}</span>
        </div>
        <div className="mt-3 overflow-x-auto scrollbar-thin">
          <div className="min-w-[640px]">
            <div className="relative ml-8 h-4 text-[10px] text-faint">
              {monthLabels.map((m) => (
                <span key={m.col} className="absolute capitalize" style={{ left: `${(m.col / heat.length) * 100}%` }}>{m.label}</span>
              ))}
            </div>
            <div className="flex gap-1">
              <div className="grid grid-rows-7 gap-1 pr-1 text-[10px] text-faint">
                {Array.from({ length: 7 }, (_, i) => <span key={i} className="h-3.5 leading-[14px]">{i % 2 === 0 ? dayShort(heat[0]?.[i]?.day ?? '2024-01-01') : ''}</span>)}
              </div>
              <div className="grid flex-1 grid-flow-col gap-1" style={{ gridTemplateRows: 'repeat(7, 14px)', gridTemplateColumns: `repeat(${heat.length}, minmax(0, 1fr))` }}>
                {heat.flatMap((col) =>
                  col.map((c) => (
                    <div
                      key={c.day}
                      onMouseEnter={() => setHover(c)}
                      onMouseLeave={() => setHover(null)}
                      title={`${c.day}: ${c.count}`}
                      className={cn('h-3.5 rounded-[3px] transition', c.future ? 'bg-transparent' : LEVEL_CLASS[c.level], hover?.day === c.day && 'ring-2 ring-primary')}
                    />
                  )),
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-faint">
              {t('stats.less')}
              {([0, 1, 2, 3, 4] as const).map((l) => <span key={l} className={cn('h-3 w-3 rounded-[3px]', LEVEL_CLASS[l])} />)}
              {t('stats.more')}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5" aria-label={t('stats.forecast')}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">{t('stats.forecast')}</h2>
            <Tabs value={forecastDays} onChange={setForecastDays} items={[{ value: '7', label: t('stats.days', { count: 7 }) }, { value: '30', label: t('stats.days', { count: 30 }) }]} />
          </div>
          <p className="mt-1 text-xs text-muted">{t('stats.forecastHint', { count: forecast.reduce((a, b) => a + b.count, 0) })}</p>
          <div className="mt-3">
            <Bars
              ariaLabel={t('stats.forecast')}
              bars={forecast.map((b: ForecastBar) => ({ label: b.day, count: b.count }))}
              labelEvery={forecastDays === '7' ? 1 : 5}
              formatLabel={(l, i) => (forecastDays === '7' ? (i === 0 ? t('stats.today') : dayShort(l)) : l.slice(8))}
            />
          </div>
        </section>

        <section className="card p-5" aria-label={t('stats.perDay')}>
          <h2 className="font-bold">{t('stats.perDay')}</h2>
          <p className="mt-1 text-xs text-muted">{t('stats.perDayHint', { avg: (last30 / 30).toFixed(1) })}</p>
          <div className="mt-3">
            <Bars ariaLabel={t('stats.perDay')} bars={perDay.map((b) => ({ label: b.day, count: b.count }))} labelEvery={5} formatLabel={(l) => l.slice(8)} />
          </div>
        </section>

        <section className="card p-5" aria-label={t('stats.intervals')}>
          <h2 className="font-bold">{t('stats.intervals')}</h2>
          <p className="mt-1 text-xs text-muted">{t('stats.intervalsHint')}</p>
          <div className="mt-3">
            <Bars ariaLabel={t('stats.intervals')} bars={hist.map((b: HistogramBin) => ({ label: b.label, count: b.count }))} />
          </div>
        </section>

        <section className="card p-5" aria-label={t('stats.mastery')}>
          <h2 className="font-bold">{t('stats.mastery')}</h2>
          {table.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t('home.noSetsYet')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {table.map((row) => (
                <li key={row.set.id} className="flex items-center gap-3 py-2.5">
                  <Ring value={row.mastery} size={40} stroke={4} label={`${row.mastery}`} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/set/${row.set.id}`} className="block truncate text-sm font-semibold hover:text-primary">{row.set.title}</Link>
                    <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2" title={`${t('common:bucket.mastered')} ${row.buckets.mastered} · ${t('common:bucket.known')} ${row.buckets.known} · ${t('common:bucket.learning')} ${row.buckets.learning} · ${t('common:bucket.new')} ${row.buckets.new}`}>
                      {row.cards > 0 && (
                        <>
                          <span className="bg-accent" style={{ width: `${(row.buckets.mastered / row.cards) * 100}%` }} />
                          <span className="bg-primary" style={{ width: `${(row.buckets.known / row.cards) * 100}%` }} />
                          <span className="bg-highlight" style={{ width: `${(row.buckets.learning / row.cards) * 100}%` }} />
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-xs tabular-nums text-muted">{t('common:common.terms', { count: row.cards })}</span>
                  {row.mastery === 100 && <Trophy size={16} className="text-highlight" />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
