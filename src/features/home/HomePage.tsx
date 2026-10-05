import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight, BookOpen, Bot, Brain, ClipboardList, Gamepad2, Import, Layers, Pencil, Radio, Search, Settings, Shuffle, Sparkles, Trophy,
} from 'lucide-react'
import { db } from '@/db/db'
import { useSettings } from '@/app/settings-store'
import { dailyPlan } from '@/domain/srs'
import { effectiveStreak, emptyStreak } from '@/domain/achievements'
import { Button, cn } from '@/ui'
import { useStudyTracker } from '@/features/achievements'
import { InstallBanner, OfflineIndicator } from '@/features/pwa'
import { timeAgo, useSetMeta, useSets } from '@/features/library'
import { OnboardingCard } from './OnboardingCard'

function greetingKey(h = new Date().getHours()): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (h < 5) return 'night'
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

const TINTS = {
  indigo: 'bg-primary-soft text-primary',
  teal: 'bg-secondary-soft text-secondary',
  green: 'bg-accent-soft text-accent',
  orange: 'bg-highlight-soft text-highlight',
} as const

function QuickCard({ to, icon, title, blurb, tint }: { to: string; icon: ReactNode; title: string; blurb: string; tint: keyof typeof TINTS }) {
  return (
    <Link to={to} className={cn('group relative flex min-w-0 flex-col gap-4 rounded-2xl border border-transparent p-5 transition hover:-translate-y-0.5 hover:border-border hover:shadow-card active:translate-y-0', TINTS[tint])}>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface/80 shadow-sm">{icon}</span>
      <div className="min-w-0 pr-8">
        <div className="truncate text-base font-bold text-text">{title}</div>
        <div className="mt-0.5 truncate text-sm text-text/70">{blurb}</div>
      </div>
      <ArrowRight size={18} className="absolute bottom-5 right-5 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
    </Link>
  )
}

export default function HomePage() {
  useStudyTracker()
  const { t, i18n } = useTranslation('library')
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const sets = useSets()
  const meta = useSetMeta()
  const progress = useLiveQuery(() => db.progress.toArray(), [])
  const streak = useLiveQuery(() => db.streak.get('streak'), []) ?? emptyStreak()
  const [q, setQ] = useState('')

  const recent = useMemo(
    () => (sets ?? []).filter((s) => !s.draft).sort((a, b) => Math.max(b.lastStudiedAt ?? 0, b.updatedAt) - Math.max(a.lastStudiedAt ?? 0, a.updatedAt)).slice(0, 6),
    [sets],
  )
  const chips = useMemo(() => {
    const out: string[] = []
    for (const s of recent) {
      if (s.title && !out.includes(s.title)) out.push(s.title)
      for (const tag of s.tags) if (!out.includes(tag)) out.push(tag)
      if (out.length >= 5) break
    }
    return out.slice(0, 5)
  }, [recent])

  const today = useMemo(() => {
    if (!progress || !sets) return null
    const bySet = new Map<string, typeof progress>()
    for (const p of progress) {
      const arr = bySet.get(p.setId) ?? []
      arr.push(p)
      bySet.set(p.setId, arr)
    }
    const rows: Array<{ setId: string; title: string; due: number; fresh: number }> = []
    let due = 0
    let fresh = 0
    for (const s of sets) {
      if (s.draft) continue
      const list = bySet.get(s.id) ?? []
      const plan = dailyPlan(list, settings.srs)
      const seen = new Set(list.filter((p) => p.variant === 'forward').map((p) => p.cardId)).size
      const unseen = Math.max(0, (meta?.get(s.id)?.cards ?? 0) - seen)
      const newCount = Math.min(settings.srs.newPerDay, plan.fresh.length + unseen)
      if (plan.due.length || newCount) rows.push({ setId: s.id, title: s.title, due: plan.due.length, fresh: newCount })
      due += plan.due.length
      fresh += newCount
    }
    rows.sort((a, b) => b.due - a.due || b.fresh - a.fresh)
    return { due, fresh, rows: rows.slice(0, 4) }
  }, [progress, sets, meta, settings.srs])

  const streakNow = effectiveStreak(streak)
  const name = settings.displayName.trim()
  const submitSearch = (value: string) => {
    const v = value.trim()
    navigate(v ? `/search?q=${encodeURIComponent(v)}` : '/search')
  }

  const quickLinks: Array<{ to: string; icon: ReactNode; label: string }> = [
    { to: recent[0] ? `/set/${recent[0].id}/flashcards` : '/library', icon: <Layers size={20} />, label: t('common:modes.flashcards') },
    { to: recent[0] ? `/set/${recent[0].id}/learn` : '/library', icon: <Brain size={20} />, label: t('common:modes.learn') },
    { to: recent[0] ? `/set/${recent[0].id}/test` : '/library', icon: <ClipboardList size={20} />, label: t('common:modes.test') },
    { to: recent[0] ? `/set/${recent[0].id}/match` : '/games', icon: <Shuffle size={20} />, label: t('common:modes.match') },
    { to: '/live', icon: <Radio size={20} />, label: t('common:nav.live') },
    { to: '/ai', icon: <Bot size={20} />, label: t('common:nav.ai') },
    { to: '/achievements', icon: <Trophy size={20} />, label: t('common:nav.achievements') },
    { to: '/settings', icon: <Settings size={20} />, label: t('common:nav.settings') },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <OfflineIndicator />
      <header>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t(`common:greeting.${greetingKey()}`)}{name ? `, ${name}` : ''} <span aria-hidden>{settings.avatar}</span>
        </h1>
        <p className="mt-1.5 text-muted">{streakNow > 0 ? t('home.subtitleStreak', { count: streakNow }) : t('home.subtitle')}</p>
      </header>

      {!settings.onboarded && <OnboardingCard />}

      <section aria-label={t('common:common.search')}>
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            submitSearch(q)
          }}
        >
          <Search size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('home.searchPlaceholder')}
            aria-label={t('common:common.search')}
            className="h-14 w-full rounded-2xl border border-border bg-surface pl-13 pr-28 text-base shadow-card placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2">{t('common:common.search')}</Button>
        </form>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t('home.trySearching')}</span>
            {chips.map((c) => (
              <button key={c} onClick={() => submitSearch(c)} className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-primary hover:text-primary">
                {c}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('home.quickActions')}>
        <QuickCard to="/library" tint="indigo" icon={<BookOpen size={20} />} title={t('home.cards.study.title')} blurb={t('home.cards.study.blurb')} />
        <QuickCard to="/games" tint="teal" icon={<Gamepad2 size={20} />} title={t('home.cards.games.title')} blurb={t('home.cards.games.blurb')} />
        <QuickCard to="/create" tint="green" icon={<Pencil size={20} />} title={t('home.cards.create.title')} blurb={t('home.cards.create.blurb')} />
        <QuickCard to="/import" tint="orange" icon={<Import size={20} />} title={t('home.cards.import.title')} blurb={t('home.cards.import.blurb')} />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card min-w-0 p-5 lg:col-span-2" aria-label={t('home.today')}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{t('home.today')}</h2>
              <p className="text-sm text-muted">{t('home.todayHint')}</p>
            </div>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold', streakNow > 0 ? 'bg-highlight-soft text-highlight' : 'bg-surface-2 text-muted')} title={t('home.streakTitle')}>
              🔥 {t('home.streak', { count: streakNow })}
            </span>
          </div>
          <div className="mt-4 flex gap-3">
            <div className="flex-1 rounded-2xl bg-primary-soft px-4 py-3">
              <div className="text-3xl font-bold text-primary">{today?.due ?? 0}</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-primary/80">{t('home.due')}</div>
            </div>
            <div className="flex-1 rounded-2xl bg-accent-soft px-4 py-3">
              <div className="text-3xl font-bold text-accent">{today?.fresh ?? 0}</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-accent/80">{t('home.new')}</div>
            </div>
          </div>
          {today && today.rows.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {today.rows.map((r) => (
                <li key={r.setId} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.title}</div>
                    <div className="text-xs text-muted">{t('home.dueNew', { due: r.due, fresh: r.fresh })}</div>
                  </div>
                  <Link to={`/set/${r.setId}/srs`}><Button size="sm">{t('common:common.start')}</Button></Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted">{sets?.length ? t('home.allDone') : t('home.noSetsYet')}</p>
          )}
        </section>

        <section className="min-w-0 lg:col-span-3" aria-label={t('home.recent')}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{t('home.recent')}</h2>
            <Link to="/library" className="text-sm font-semibold text-primary hover:underline">{t('home.viewAll')}</Link>
          </div>
          {recent.length === 0 ? (
            <div className="card mt-3 p-6 text-center text-sm text-muted">
              {t('home.noSetsYet')}
              <div className="mt-3 flex justify-center gap-2">
                <Link to="/create"><Button size="sm">{t('library.newSet')}</Button></Link>
                <Link to="/import"><Button size="sm" variant="outline">{t('common:common.import')}</Button></Link>
              </div>
            </div>
          ) : (
            <ul className="card mt-3 divide-y divide-border p-0">
              {recent.map((s, i) => {
                const m = meta?.get(s.id)
                const tint = (['indigo', 'teal', 'green', 'orange'] as const)[i % 4]
                return (
                  <li key={s.id}>
                    <Link to={`/set/${s.id}`} className="group flex items-center gap-4 px-4 py-3 transition hover:bg-surface-2/60">
                      <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', TINTS[tint])}><BookOpen size={20} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold group-hover:text-primary">{s.title}</div>
                        <div className="text-xs text-muted">
                          {t('common:common.terms', { count: m?.cards ?? 0 })} · {s.lastStudiedAt ? t('library.studied', { when: timeAgo(s.lastStudiedAt, i18n.language) }) : t('library.updated', { when: timeAgo(s.updatedAt, i18n.language) })}
                          {m && m.mastery > 0 && ` · ${t('home.mastery', { pct: m.mastery })}`}
                        </div>
                      </div>
                      <ArrowRight size={18} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-label={t('home.quickLinks')}>
        <h2 className="text-lg font-bold">{t('home.quickLinks')}</h2>
        <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-8">
          {quickLinks.map((l) => (
            <Link key={l.label} to={l.to} className="group flex flex-col items-center gap-2 rounded-2xl p-2 text-center transition hover:bg-surface-2">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface shadow-card text-muted transition group-hover:text-primary">{l.icon}</span>
              <span className="text-xs font-medium text-muted group-hover:text-text">{l.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <InstallBanner />

      <p className="flex items-center justify-center gap-1.5 pb-4 text-xs text-faint"><Sparkles size={12} />{t('home.privacyNote')}</p>
    </div>
  )
}
