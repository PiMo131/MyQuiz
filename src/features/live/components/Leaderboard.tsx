import { useTranslation } from 'react-i18next'
import { Flame } from 'lucide-react'
import type { LeaderboardEntry, LiveTeam, TeamStanding } from '@/domain/live/protocol'
import { cn } from '@/ui'
import { Avatar } from './Avatar'

export function Leaderboard({ entries, teams, highlight, limit, compact, className }: { entries: LeaderboardEntry[]; teams?: LiveTeam[]; highlight?: string; limit?: number; compact?: boolean; className?: string }) {
  const { t } = useTranslation('live')
  const shown = limit ? entries.slice(0, limit) : entries
  const rest = entries.length - shown.length
  return (
    <ol className={cn('space-y-1.5', className)} aria-label={t('host.leaderboard')}>
      {shown.map((e) => {
        const team = teams?.find((x) => x.id === e.teamId)
        return (
          <li
            key={e.id}
            className={cn(
              'flex items-center gap-3 rounded-xl bg-surface px-3 py-2',
              compact ? 'text-sm' : 'text-base',
              e.id === highlight && 'ring-2 ring-primary',
              !e.connected && 'opacity-50',
            )}
          >
            <span className={cn('w-7 text-center font-black tabular-nums', e.rank === 1 ? 'text-highlight' : 'text-muted')}>{e.rank}</span>
            <Avatar emoji={e.avatar} size={compact ? 'sm' : 'md'} color={team?.color} />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {e.name}
              {team && <span className="ml-1.5 text-xs text-muted">{team.emoji}</span>}
            </span>
            {e.streak >= 2 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-highlight">
                <Flame size={14} /> {e.streak}
              </span>
            )}
            <span className="font-bold tabular-nums">{e.score}</span>
          </li>
        )
      })}
      {rest > 0 && <li className="px-3 text-xs text-muted">+{rest}</li>}
    </ol>
  )
}

export function TeamBoard({ teams, className }: { teams: TeamStanding[]; className?: string }) {
  const { t } = useTranslation('live')
  return (
    <ol className={cn('space-y-2', className)} aria-label={t('host.teams')}>
      {teams.map((s) => (
        <li key={s.team.id} className="flex items-center gap-3 rounded-xl px-3 py-2 text-white" style={{ background: s.team.color }}>
          <span className="w-6 text-center font-black">{s.rank}</span>
          <span className="text-2xl" aria-hidden="true">
            {s.team.emoji}
          </span>
          <span className="min-w-0 flex-1 truncate font-bold">
            {s.team.name} <span className="text-xs font-medium opacity-80">({s.members.length})</span>
          </span>
          <span className="font-bold tabular-nums">{s.score}</span>
        </li>
      ))}
    </ol>
  )
}
