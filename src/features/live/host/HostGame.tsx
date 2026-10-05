import { useTranslation } from 'react-i18next'
import { Flag, SkipForward } from 'lucide-react'
import type { LeaderboardEntry, PublicState, TeamStanding } from '@/domain/live/protocol'
import { Button, cn } from '@/ui'
import { Avatar } from '../components/Avatar'
import { AnswerButtons } from '../components/AnswerButtons'
import { Leaderboard, TeamBoard } from '../components/Leaderboard'
import { TimerBar, formatMs, useCountdown } from '../components/TimerBar'

export interface HostGameProps {
  view: PublicState
  onEnd: () => void
  onNextRound: () => void
}

export function HostGame({ view, onEnd, onNextRound }: HostGameProps) {
  const { t } = useTranslation('live')
  const { config } = view
  if (view.phase === 'countdown') return <Countdown target={view.countdownEndsAt} />
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {config.mode === 'classic' && <ClassicLanes view={view} />}
        {config.mode === 'match' && <MatchBars view={view} />}
        {config.mode === 'blast' && <BlastBoard view={view} />}
        {config.mode === 'study' && <StudyRound view={view} onNext={onNextRound} />}
      </div>
      {config.mode !== 'classic' && (
        <aside className="w-full shrink-0 lg:w-80">
          {view.teams.length > 0 && <TeamBoard teams={view.teams} className="mb-3" />}
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t('host.leaderboard')}</h2>
          <Leaderboard entries={view.players} teams={view.teams.map((s) => s.team)} limit={12} compact />
          <Button variant="outline" size="sm" leftIcon={<Flag size={14} />} onClick={onEnd} className="mt-4 w-full">
            {t('host.end')}
          </Button>
        </aside>
      )}
      {config.mode === 'classic' && (
        <div className="flex justify-end lg:absolute lg:bottom-4 lg:right-4">
          <Button variant="outline" size="sm" leftIcon={<Flag size={14} />} onClick={onEnd}>
            {t('host.end')}
          </Button>
        </div>
      )}
    </div>
  )
}

export function Countdown({ target, offset = 0 }: { target: number | null; offset?: number }) {
  const { t } = useTranslation('live')
  const left = useCountdown(target, offset)
  const n = Math.max(1, Math.ceil(left / 1000))
  return (
    <div className="grid flex-1 place-items-center p-8 text-center">
      <div>
        <div className="text-2xl font-bold text-muted sm:text-4xl">{t('host.countdown')}</div>
        <div key={n} className="mt-4 text-[9rem] font-black leading-none text-gradient-indigo animate-pop sm:text-[14rem]" aria-live="assertive">
          {n}
        </div>
      </div>
    </div>
  )
}

/** Classic Live: one lane per player (or team) racing to the target. */
function ClassicLanes({ view }: { view: PublicState }) {
  const { t } = useTranslation('live')
  const target = view.config.maxQuestions
  const teams = view.teams
  const lanes: Array<{ key: string; label: string; emoji: string; color?: string; progress: number; streak: number; members?: LeaderboardEntry[]; finished: boolean }> = teams.length
    ? teams.map((s: TeamStanding) => ({
        key: s.team.id,
        label: s.team.name,
        emoji: s.team.emoji,
        color: s.team.color,
        progress: s.progress,
        streak: 0,
        members: view.players.filter((p) => p.teamId === s.team.id),
        finished: s.progress >= target,
      }))
    : view.players.map((p) => ({ key: p.id, label: p.name, emoji: p.avatar, progress: p.progress, streak: p.streak, finished: p.finishedAt !== null }))
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold sm:text-3xl">{t('host.target', { count: target })}</h2>
        <span className="text-sm text-muted">{t('host.playersJoined', { count: view.players.length })}</span>
      </div>
      <ol className="flex flex-1 flex-col justify-center gap-3">
        {lanes.map((lane) => {
          const pct = Math.min(100, (lane.progress / target) * 100)
          return (
            <li key={lane.key} className={cn('card relative flex items-center gap-4 p-3 sm:p-4', lane.finished && 'ring-2 ring-accent')}>
              <div className="w-28 shrink-0 truncate text-sm font-bold sm:w-40 sm:text-lg">{lane.label}</div>
              <div className="relative h-10 flex-1 rounded-full bg-surface-2 sm:h-12">
                <div className="absolute inset-0 flex">
                  {Array.from({ length: target }).map((_, i) => (
                    <div key={i} className="h-full flex-1 border-r border-bg last:border-r-0" />
                  ))}
                </div>
                <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: lane.color ?? 'var(--color-primary)', opacity: 0.35 }} />
                <div className="absolute top-1/2 -translate-y-1/2 transition-[left] duration-500" style={{ left: `calc(${pct}% - 1.25rem)` }}>
                  <Avatar emoji={lane.emoji} color={lane.color} className="bg-surface shadow-pop" />
                </div>
              </div>
              <div className="w-20 shrink-0 text-right">
                <div className="text-xl font-black tabular-nums sm:text-3xl">
                  {lane.progress}
                  <span className="text-sm text-muted">/{target}</span>
                </div>
                {lane.streak >= 2 && <div className="text-xs font-semibold text-highlight">🔥 {t('host.inARow', { count: lane.streak })}</div>}
              </div>
              {lane.members && (
                <div className="absolute -bottom-2 left-4 flex gap-1">
                  {lane.members.map((m) => (
                    <Avatar key={m.id} emoji={m.avatar} size="sm" className={cn('bg-surface shadow', !m.connected && 'opacity-40')} />
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Multiplayer Match: progress bars per player, ordered by progress / finish time. */
function MatchBars({ view }: { view: PublicState }) {
  const { t } = useTranslation('live')
  const total = view.config.matchPairs
  return (
    <div className="flex flex-1 flex-col gap-3">
      <h2 className="text-xl font-bold sm:text-3xl">{t('modes.match.name')}</h2>
      <ol className="flex flex-1 flex-col justify-center gap-2">
        {view.players.map((p) => {
          const pairs = Math.min(p.progress, total)
          return (
            <li key={p.id} className={cn('card flex items-center gap-3 p-3', p.finishedAt !== null && 'ring-2 ring-accent')}>
              <Avatar emoji={p.avatar} color={view.teams.find((s) => s.team.id === p.teamId)?.team.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold sm:text-lg">{p.name}</span>
                  <span className="text-sm font-semibold tabular-nums text-muted">
                    {p.finishedAt !== null && view.startedAt !== null ? `${t('host.finished')} · ${formatMs(p.finishedAt - view.startedAt)}` : t('host.pairs', { matched: pairs, total })}
                  </span>
                </div>
                <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-surface-2">
                  <div className={cn('h-full rounded-full transition-[width] duration-300', p.finishedAt !== null ? 'bg-accent' : 'bg-secondary')} style={{ width: `${(pairs / Math.max(1, total)) * 100}%` }} />
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Blast live: big timer + live standings. */
function BlastBoard({ view }: { view: PublicState }) {
  const { t } = useTranslation('live')
  const left = useCountdown(view.endsAt)
  const total = view.config.blastSeconds * 1000
  const pct = Math.max(0, Math.min(100, (left / total) * 100))
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="card flex items-center justify-between gap-4 p-5">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wide text-muted">{t('host.timeLeft')}</div>
          <div className={cn('text-6xl font-black tabular-nums sm:text-8xl', left < 10_000 && 'text-error')}>{formatMs(left)}</div>
        </div>
        <div className="hidden h-32 w-32 sm:block">
          <svg viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-surface-2)" strokeWidth="10" />
            <circle cx="50" cy="50" r="44" fill="none" stroke={left < 10_000 ? 'var(--color-error)' : 'var(--color-primary)'} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 44}`} strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`} />
          </svg>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {view.players.slice(0, 9).map((p) => (
          <div key={p.id} className={cn('card flex items-center gap-3 p-3', p.rank === 1 && 'ring-2 ring-highlight')}>
            <span className="w-6 text-center text-xl font-black text-muted">{p.rank}</span>
            <Avatar emoji={p.avatar} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{p.name}</div>
              <div className="text-xs text-muted">{p.streak >= 2 ? `🔥 ${t('host.inARow', { count: p.streak })}` : ' '}</div>
            </div>
            <div className="text-2xl font-black tabular-nums">{p.score}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Study with friends: shared question on the big screen with answer distribution on reveal. */
function StudyRound({ view, onNext }: { view: PublicState; onNext: () => void }) {
  const { t } = useTranslation('live')
  const r = view.round
  if (!r) return <div className="grid flex-1 place-items-center text-muted">{t('host.waitingAnswers')}</div>
  const revealed = r.reveal !== null
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between text-sm font-semibold text-muted">
        <span>{t('host.question', { n: r.n + 1, total: r.total })}</span>
        <span>{t('host.answered', { answered: r.answered, expected: r.expected })}</span>
      </div>
      {!revealed && <TimerBar deadlineAt={r.question.deadlineAt} startedAt={r.question.askedAt} big />}
      <div className="card grid min-h-40 flex-1 place-items-center p-6 text-center text-3xl font-bold sm:text-5xl">{r.question.prompt}</div>
      <AnswerButtons options={r.question.options} keyboard={false} correct={r.reveal} counts={r.distribution} size="lg" />
      <div className="flex justify-end">
        <Button leftIcon={<SkipForward size={16} />} onClick={onNext} variant={revealed ? 'primary' : 'secondary'}>
          {revealed ? t('host.next') : t('host.reveal')}
        </Button>
      </div>
    </div>
  )
}
