import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flame, ShieldCheck, Zap } from 'lucide-react'
import type { Feedback, PlayerView, PowerUpKind } from '@/domain/live/protocol'
import { Button, cn } from '@/ui'
import { AnswerButtons } from '../components/AnswerButtons'
import { Avatar } from '../components/Avatar'
import { Leaderboard } from '../components/Leaderboard'
import { TimerBar, formatMs, useCountdown } from '../components/TimerBar'
import { Countdown } from '../host/HostGame'
import { MatchBoard } from './MatchBoard'

export interface PlayerGameProps {
  view: PlayerView
  offset?: number
  onAnswer: (questionId: string, choice: number) => void
  onPower: (kind: PowerUpKind) => void
  onMatch: (matched: number, done: boolean) => void
  play?: (cue: 'correct' | 'wrong' | 'go' | 'finish') => void
  /** compact layout when embedded on the host screen */
  embedded?: boolean
}

/** Everything a player sees between the countdown and the results. */
export function PlayerGame({ view, offset = 0, onAnswer, onPower, onMatch, play, embedded }: PlayerGameProps) {
  const { t } = useTranslation('live')
  const { config, me } = view
  const [answered, setAnswered] = useState<string | null>(null)
  const lastFb = useRef<Feedback | null>(null)

  // play a cue when new feedback arrives
  useEffect(() => {
    const fb = view.feedback
    if (fb && fb !== lastFb.current && fb.at !== lastFb.current?.at) {
      lastFb.current = fb
      play?.(fb.correct ? 'correct' : 'wrong')
    }
  }, [view.feedback, play])

  useEffect(() => {
    if (view.phase === 'playing' && view.startedAt && Date.now() + offset - view.startedAt < 1500) play?.('go')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase])

  if (view.phase === 'countdown') return <Countdown target={view.countdownEndsAt} offset={offset} />
  if (!me) return null

  const header = (
    <div className={cn('flex items-center gap-3 text-sm', embedded && 'text-xs')}>
      <Avatar emoji={me.avatar} size="sm" color={view.team?.color} />
      <span className="min-w-0 flex-1 truncate font-semibold">
        {me.name}
        {view.team && <span className="ml-1 text-muted">· {view.team.emoji} {view.team.name}</span>}
      </span>
      {me.streak >= 2 && (
        <span className="inline-flex items-center gap-0.5 font-semibold text-highlight">
          <Flame size={14} /> {me.streak}
        </span>
      )}
      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 font-bold tabular-nums">{me.score}</span>
      <span className="text-muted">#{view.rank}</span>
    </div>
  )

  // ----- match -----
  if (config.mode === 'match') {
    if (me.finishedAt !== null) {
      return (
        <div className="flex flex-1 flex-col gap-4">
          {header}
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <div className="text-5xl">🎉</div>
              <div className="mt-2 text-2xl font-bold">{t('play.matchDone')}</div>
              {view.startedAt && <div className="text-muted">{t('play.matchTime', { time: formatMs(me.finishedAt - view.startedAt) })}</div>}
              <p className="mt-4 text-sm text-muted">{t('play.finishedWaiting')}</p>
            </div>
          </div>
          <Leaderboard entries={view.leaderboard} highlight={me.id} limit={5} compact />
        </div>
      )
    }
    return (
      <div className="flex flex-1 flex-col gap-4">
        {header}
        {view.board ? <MatchBoard tiles={view.board} onProgress={onMatch} onSound={play} /> : <div className="text-muted">{t('play.waitOthers')}</div>}
      </div>
    )
  }

  // ----- study (shared round) -----
  if (config.mode === 'study') {
    const r = view.round
    if (!r) return <div className="grid flex-1 place-items-center text-muted">{t('play.waitOthers')}</div>
    const revealed = r.reveal !== null
    const mine = r.myChoice
    return (
      <div className="flex flex-1 flex-col gap-4">
        {header}
        <div className="flex items-center justify-between text-xs font-semibold text-muted">
          <span>{t('host.question', { n: r.n + 1, total: r.total })}</span>
          <span>{t('host.answered', { answered: r.answered, expected: r.expected })}</span>
        </div>
        {!revealed && mine === null && <TimerBar deadlineAt={r.question.deadlineAt} startedAt={r.question.askedAt} offset={offset} />}
        <div className="card grid min-h-28 place-items-center p-4 text-center text-xl font-bold sm:text-2xl">{r.question.prompt}</div>
        <AnswerButtons options={r.question.options} onPick={(i) => onAnswer(r.question.id, i)} disabled={mine !== null || revealed} picked={mine} correct={r.reveal} />
        {mine !== null && !revealed && <p className="text-center text-sm text-muted">{t('play.waitOthers')}</p>}
        {revealed && view.feedback && <FeedbackBanner fb={view.feedback} />}
      </div>
    )
  }

  // ----- classic / blast (personal stream) -----
  const q = view.question
  const fb = view.feedback
  const showFeedback = fb && (!q || answered === q.id || fb.at > q.askedAt - 1)
  const waitingNext = Boolean(q && answered === q.id)
  const finished = me.finishedAt !== null
  return (
    <div className="flex flex-1 flex-col gap-3">
      {header}
      <div className="flex items-center justify-between text-xs font-semibold text-muted">
        {config.mode === 'classic' ? (
          <span>{t('play.progress', { current: me.progress, target: config.maxQuestions })}</span>
        ) : (
          <BlastClock endsAt={view.endsAt} offset={offset} />
        )}
        {q && <span>#{q.n + 1}</span>}
      </div>
      {config.mode === 'classic' && (
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: config.maxQuestions }).map((_, i) => (
            <div key={i} className={cn('h-1.5 flex-1 rounded-full', i < me.progress ? 'bg-accent' : 'bg-surface-2')} />
          ))}
        </div>
      )}
      {finished ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <div className="text-5xl">🏁</div>
            <p className="mt-3 text-lg font-bold">{t('play.finishedWaiting')}</p>
          </div>
        </div>
      ) : q && !waitingNext ? (
        <>
          <TimerBar deadlineAt={q.deadlineAt} startedAt={q.askedAt} offset={offset} />
          <div className={cn('card grid place-items-center p-4 text-center font-bold', embedded ? 'min-h-20 text-lg' : 'min-h-28 text-xl sm:text-2xl')}>{q.prompt}</div>
          <AnswerButtons
            options={q.options}
            onPick={(i) => {
              setAnswered(q.id)
              onAnswer(q.id, i)
            }}
            keyboard={!embedded}
          />
          {!embedded && <p className="hidden text-center text-xs text-muted sm:block">{t('play.keyboardHint')}</p>}
        </>
      ) : (
        <div className="grid flex-1 place-items-center">{showFeedback && fb ? <FeedbackBanner fb={fb} big /> : <p className="text-muted">{t('play.nextSoon')}</p>}</div>
      )}
      {showFeedback && fb && q && !waitingNext && <FeedbackBanner fb={fb} />}
      <PowerUps me={me} onPower={onPower} />
    </div>
  )
}

function BlastClock({ endsAt, offset }: { endsAt: number | null; offset: number }) {
  const left = useCountdown(endsAt, offset)
  return <span className={cn('tabular-nums', left < 10_000 && 'text-error')}>⏱ {formatMs(left)}</span>
}

export function FeedbackBanner({ fb, big }: { fb: Feedback; big?: boolean }) {
  const { t } = useTranslation('live')
  return (
    <div
      role="status"
      className={cn(
        'animate-pop rounded-2xl p-4 text-center',
        fb.correct ? 'bg-accent-soft text-accent' : 'bg-error-soft text-error',
        big && 'w-full max-w-md p-6',
      )}
    >
      <div className={cn('font-black', big ? 'text-4xl' : 'text-xl')}>{fb.correct ? t('play.correct') : fb.given === null ? t('play.timeUp') : t('play.wrong')}</div>
      {fb.correct ? (
        <div className={cn('mt-1 font-semibold', big ? 'text-xl' : 'text-sm')}>
          {t('play.points', { count: fb.points })}
          {fb.streak >= 2 && <span> · 🔥 {t('play.streak', { count: fb.streak })}</span>}
          {fb.doubled && <span> · ⚡ {t('play.doubled')}</span>}
        </div>
      ) : (
        <div className={cn('mt-1', big ? 'text-lg' : 'text-sm')}>
          <span className="text-muted">{t('play.answerWas')}</span> <span className="font-semibold text-text">{fb.expected}</span>
          {fb.usedSaver && <div className="mt-1 text-xs font-semibold text-highlight">🛡 {t('play.saverUsed')}</div>}
        </div>
      )}
    </div>
  )
}

function PowerUps({ me, onPower }: { me: PlayerView['me'] & object; onPower: (k: PowerUpKind) => void }) {
  const { t } = useTranslation('live')
  const d = me.powerUps.double
  const s = me.powerUps.saver
  const label = (st: string) => (st === 'available' ? t('play.ready') : st === 'armed' ? t('play.armed') : t('play.used'))
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant={d === 'armed' ? 'primary' : 'outline'}
        size="sm"
        disabled={d !== 'available'}
        onClick={() => onPower('double')}
        leftIcon={<Zap size={14} />}
        title={t('play.powerDoubleHint')}
        className="justify-between"
      >
        <span className="truncate">{t('play.powerDouble')}</span>
        <span className="text-xs opacity-80">{label(d)}</span>
      </Button>
      <div
        className={cn('inline-flex h-8 items-center justify-between gap-2 rounded-full border border-border px-3 text-sm font-semibold', s === 'used' && 'opacity-50')}
        title={t('play.powerSaverHint')}
        role="status"
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <ShieldCheck size={14} /> {t('play.powerSaver')}
        </span>
        <span className="text-xs text-muted">{label(s)}</span>
      </div>
    </div>
  )
}
