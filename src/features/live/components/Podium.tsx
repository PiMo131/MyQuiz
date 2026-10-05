import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { LeaderboardEntry, LiveTeam } from '@/domain/live/protocol'
import { cn } from '@/ui'
import { Avatar } from './Avatar'

export function fireConfetti(): void {
  void import('canvas-confetti')
    .then((m) => {
      const confetti = m.default
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
      setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0 } }), 250)
      setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1 } }), 400)
    })
    .catch(() => undefined)
}

export function Podium({ entries, teams, confetti = true, className }: { entries: LeaderboardEntry[]; teams?: LiveTeam[]; confetti?: boolean; className?: string }) {
  const { t } = useTranslation('live')
  useEffect(() => {
    if (confetti && entries.length) fireConfetti()
  }, [confetti, entries.length])
  const top = entries.slice(0, 3)
  const order = [top[1], top[0], top[2]]
  const heights = ['h-24 sm:h-32', 'h-36 sm:h-48', 'h-16 sm:h-24']
  const medals = ['🥈', '🥇', '🥉']
  return (
    <div className={cn('flex items-end justify-center gap-2 sm:gap-4', className)} aria-label={t('results.podium')}>
      {order.map((e, i) =>
        e ? (
          <div key={e.id} className="flex w-28 flex-col items-center gap-2 sm:w-40">
            <Avatar emoji={e.avatar} size={i === 1 ? 'xl' : 'lg'} color={teams?.find((x) => x.id === e.teamId)?.color} className="animate-pop" />
            <div className="max-w-full truncate text-center font-bold">{e.name}</div>
            <div className="text-sm text-muted tabular-nums">{e.score} {t('results.points')}</div>
            <div className={cn('flex w-full items-start justify-center rounded-t-2xl pt-2 text-3xl', heights[i], i === 1 ? 'bg-gradient-indigo' : 'bg-surface-2')}>{medals[i]}</div>
          </div>
        ) : (
          <div key={i} className="w-28 sm:w-40" />
        ),
      )}
    </div>
  )
}
