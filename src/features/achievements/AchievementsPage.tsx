import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3, Flame } from 'lucide-react'
import { db } from '@/db/db'
import { ACHIEVEMENTS, effectiveStreak, emptyStreak, weeklyStreak, type AchievementCategory, type AchievementDef } from '@/domain/achievements'
import { Button, ProgressBar, cn } from '@/ui'
import { formatDate } from '@/features/library'
import { computeAchievementStats, useStudyTracker } from './tracker'
import { HexBadge } from './HexBadge'
import { StreakCalendar } from './StreakCalendar'

const CATEGORIES: AchievementCategory[] = ['study', 'streak', 'games', 'create', 'special']

export default function AchievementsPage() {
  useStudyTracker()
  const { t, i18n } = useTranslation('library')
  const unlocked = useLiveQuery(() => db.achievements.toArray(), [])
  const streak = useLiveQuery(() => db.streak.get('streak'), []) ?? emptyStreak()
  const revCount = useLiveQuery(() => db.revlog.count(), []) ?? 0
  const stats = useLiveQuery(() => computeAchievementStats(), [revCount])
  const unlockedMap = useMemo(() => new Map((unlocked ?? []).map((a) => [a.id, a.unlockedAt])), [unlocked])
  const recent = useMemo(() => [...(unlocked ?? [])].sort((a, b) => b.unlockedAt - a.unlockedAt).slice(0, 3), [unlocked])
  const current = effectiveStreak(streak)
  const weeks = weeklyStreak(streak.days)
  const earnedCount = unlocked?.length ?? 0

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('achievements.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('achievements.subtitle', { earned: earnedCount, total: ACHIEVEMENTS.length })}</p>
        </div>
        <Link to="/stats"><Button variant="outline" leftIcon={<BarChart3 size={16} />}>{t('common:nav.stats')}</Button></Link>
      </div>

      <h2 className="mt-8 text-lg font-bold">{t('achievements.recentActivity')}</h2>
      <section className="card mt-3 grid gap-8 p-6 md:grid-cols-[1fr_1.4fr_1fr]" aria-label={t('achievements.recentActivity')}>
        <div className="flex flex-col items-center text-center">
          <h3 className="text-sm font-bold">{t('achievements.recentlyEarned')}</h3>
          {recent.length === 0 ? (
            <>
              <HexBadge icon="🏅" earned={false} className="mt-4" />
              <p className="mt-3 text-xs text-muted">{t('achievements.noneYet')}</p>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-xs text-muted">{t(`achievements.items.${recent[0].id}.title`)}</p>
              <HexBadge icon={ACHIEVEMENTS.find((a) => a.id === recent[0].id)?.icon ?? '🏅'} earned className="mt-3" size={104} />
              <p className="mt-2 text-xs text-muted">{t('achievements.earnedOn', { date: formatDate(recent[0].unlockedAt, i18n.language) })}</p>
              {recent.length > 1 && (
                <div className="mt-3 flex gap-2">
                  {recent.slice(1).map((a) => (
                    <HexBadge key={a.id} icon={ACHIEVEMENTS.find((x) => x.id === a.id)?.icon ?? '🏅'} earned size={40} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <StreakCalendar days={streak.days} />
        <div className="flex flex-col items-center text-center">
          <h3 className="text-sm font-bold">{t('achievements.currentStreak')}</h3>
          <p className="mt-0.5 text-xs text-muted">{weeks > 0 ? t('achievements.weeks', { count: weeks }) : t('achievements.noStreak')}</p>
          <div className={cn('mt-4 grid h-24 w-24 place-items-center rounded-full', current > 0 ? 'bg-highlight-soft' : 'bg-surface-2')}>
            <Flame size={44} className={current > 0 ? 'text-highlight' : 'text-faint'} fill={current > 0 ? 'currentColor' : 'none'} />
          </div>
          <div className="mt-3 text-3xl font-bold tabular-nums">{current}</div>
          <div className="text-xs text-muted">{t('achievements.days', { count: current })}</div>
          <div className="mt-3 text-xs text-muted">{t('achievements.longest', { count: streak.longest })} · {t('achievements.totalDays', { count: streak.days.length })}</div>
        </div>
      </section>

      {CATEGORIES.map((cat) => {
        const list = ACHIEVEMENTS.filter((a) => a.category === cat)
        return (
          <section key={cat} className="mt-8" aria-label={t(`achievements.categories.${cat}`)}>
            <h2 className="text-lg font-bold">{t(`achievements.categories.${cat}`)}</h2>
            <div className="card mt-3 grid grid-cols-2 gap-x-4 gap-y-8 p-6 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((a) => (
                <BadgeTile key={a.id} def={a} unlockedAt={unlockedMap.get(a.id)} progress={stats && a.progress ? a.progress(stats) : undefined} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function BadgeTile({ def, unlockedAt, progress }: { def: AchievementDef; unlockedAt?: number; progress?: number }) {
  const { t, i18n } = useTranslation('library')
  const earned = unlockedAt !== undefined
  return (
    <div className="flex flex-col items-center text-center" title={t(`achievements.items.${def.id}.description`)}>
      <HexBadge icon={def.icon} earned={earned} />
      <div className={cn('mt-3 text-sm font-semibold', !earned && 'text-muted')}>{t(`achievements.items.${def.id}.title`)}</div>
      <div className="mt-0.5 min-h-8 text-xs text-muted">{t(`achievements.items.${def.id}.description`)}</div>
      {earned ? (
        <div className="mt-1 text-xs font-medium text-primary">{t('achievements.earnedOn', { date: formatDate(unlockedAt, i18n.language) })}</div>
      ) : def.target && progress !== undefined ? (
        <div className="mt-2 w-full max-w-28">
          <ProgressBar value={Math.min(progress, def.target)} max={def.target} className="h-1.5" />
          <div className="mt-1 text-[11px] tabular-nums text-faint">{Math.min(progress, def.target)} / {def.target}</div>
        </div>
      ) : (
        <div className="mt-1 text-xs text-faint">{t('achievements.locked')}</div>
      )}
    </div>
  )
}
