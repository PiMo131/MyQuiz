import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { mulberry32 } from '@/domain/text'
import type { Card } from '@/domain/types'
import { SR_QUESTIONS, SR_TIME_MS, buildSpeedQuestions, speedPoints, type SpeedQuestion } from '@/domain/games/speedreview'
import { cn } from '@/ui'
import {
  DEFAULT_GAME_OPTIONS,
  GameEnd,
  GameHeader,
  GameIntro,
  GameLayout,
  GameStatus,
  Hud,
  PausedOverlay,
  QuestionPanel,
  formatBest,
  gameMeta,
  useBestScore,
  useDocumentVisible,
  useGameCards,
  useGameOptions,
  useGameSession,
  useSfx,
  type BaseGameOptions,
} from '../shared'

interface SROptions extends BaseGameOptions {
  /** 0 = whole set */
  count: number
}
const DEFAULTS: SROptions = { ...DEFAULT_GAME_OPTIONS, count: SR_QUESTIONS }
type Phase = 'intro' | 'play' | 'end'

export default function SpeedReviewPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation(['games', 'common'])
  const [opts, setOpts] = useGameOptions<SROptions>('speedreview', DEFAULTS)
  const { set, cards, loading } = useGameCards(setId, opts.starredOnly)
  const best = useBestScore(setId, 'speedreview')
  const session = useGameSession(setId, 'speedreview')
  const play = useSfx()
  const visible = useDocumentVisible()

  const [phase, setPhase] = useState<Phase>('intro')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [questions, setQuestions] = useState<SpeedQuestion<Card>[]>([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [missed, setMissed] = useState<Card[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [locked, setLocked] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [gain, setGain] = useState<number | null>(null)
  const [result, setResult] = useState<{ best: number; isNewBest: boolean } | null>(null)
  const elapsedRef = useRef(0)
  const tickSound = useRef(false)

  const q = questions[index]

  const start = useCallback(() => {
    const qs = buildSpeedQuestions(cards, mulberry32(Date.now() & 0xfffff), opts.promptSide, opts.count > 0 ? opts.count : cards.length)
    setQuestions(qs)
    setIndex(0)
    setScore(0)
    setStreak(0)
    setCorrectCount(0)
    setMissed([])
    setElapsed(0)
    elapsedRef.current = 0
    setLocked(false)
    setTimedOut(false)
    setResult(null)
    setPhase('play')
    void session.begin({ starredOnly: opts.starredOnly, promptSide: opts.promptSide, count: opts.count })
  }, [cards, opts.count, opts.promptSide, opts.starredOnly, session])

  // per-question timer (pauses while hidden or locked)
  useEffect(() => {
    if (phase !== 'play' || locked || !visible || !q) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      elapsedRef.current += now - last
      last = now
      setElapsed(elapsedRef.current)
      if (elapsedRef.current > SR_TIME_MS * 0.7 && !tickSound.current) {
        tickSound.current = true
        play('tick')
      }
      if (elapsedRef.current >= SR_TIME_MS) {
        window.clearInterval(id)
        setLocked(true)
        setTimedOut(true)
        play('wrong')
        setStreak(0)
        setMissed((m) => [...m, q.card])
        session.answer(q.card, false, '', q.correct, opts.promptSide, SR_TIME_MS)
        window.setTimeout(() => advance(), 1100)
      }
    }, 50)
    return () => window.clearInterval(id)
  }, [phase, locked, visible, index, q])

  const finish = useCallback(
    (finalScore: number, correct: number) => {
      void session.end(finalScore, questions.length).then((r) => {
        setResult(r)
        setPhase('end')
        void correct
      })
    },
    [questions.length, session],
  )

  const advance = () => {
    setIndex((i) => {
      if (i + 1 >= questions.length) {
        finishRef.current()
        return i
      }
      return i + 1
    })
    elapsedRef.current = 0
    setElapsed(0)
    tickSound.current = false
    setLocked(false)
    setTimedOut(false)
    setGain(null)
  }
  const finishRef = useRef(() => undefined as void)
  finishRef.current = () => finish(score, correctCount)

  const onChoose = (given: string, ok: boolean) => {
    if (!q || locked) return
    setLocked(true)
    const el = elapsedRef.current
    session.answer(q.card, ok, given, q.correct, opts.promptSide, Math.round(el))
    if (ok) {
      const pts = speedPoints(el, streak)
      setScore((s) => s + pts)
      setStreak((s) => s + 1)
      setCorrectCount((c) => c + 1)
      setGain(pts)
    } else {
      setStreak(0)
      setMissed((m) => [...m, q.card])
    }
  }

  const meta = gameMeta('speedreview')
  const enough = cards.length >= meta.minCards
  const pct = Math.max(0, 1 - elapsed / SR_TIME_MS)
  const barColor = useMemo(() => {
    // indigo -> red as time drains
    const hue = Math.round(239 * pct) // 239 = indigo-ish, 0 = red
    return `hsl(${hue} 84% 60%)`
  }, [pct])

  return (
    <GameLayout header={<GameHeader setId={setId} game="speedreview" center={phase === 'play' && q ? t('games:speedreview.questionOf', { n: index + 1, total: questions.length }) : set?.title} onOptions={phase === 'intro' ? () => setOptionsOpen(true) : undefined} />}>
      <GameStatus loading={loading} found={!!set} />
      {!loading && set && phase === 'intro' && (
        <GameIntro
          game="speedreview"
          onPlay={start}
          options={opts}
          onOptions={setOpts}
          disabled={!enough}
          disabledReason={t('games:common.notEnoughCards', { count: meta.minCards })}
          optionsOpen={optionsOpen}
          onOptionsOpenChange={setOptionsOpen}
          extraOptions={
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="text-sm font-medium">{t('games:speedreview.questions')}</div>
              <div className="flex rounded-full bg-surface-2 p-1" role="radiogroup">
                {[10, 20, 0].map((n) => (
                  <button key={n} role="radio" aria-checked={opts.count === n} onClick={() => setOpts({ count: n })} className={cn('rounded-full px-3 py-1 text-sm font-medium', opts.count === n ? 'bg-surface text-text shadow' : 'text-muted')}>
                    {n === 0 ? t('games:speedreview.wholeSet') : n}
                  </button>
                ))}
              </div>
            </div>
          }
        />
      )}
      {phase === 'play' && q && (
        <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-3 sm:p-5">
          {!visible && <PausedOverlay label={t('games:common.paused')} />}
          <Hud score={score} best={formatBest('speedreview', best)} center={streak > 1 ? `🔥 ${streak}` : undefined} className="px-0" />
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemax={100} aria-label={t('games:common.timeLeft')}>
            <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${pct * 100}%`, background: barColor }} />
          </div>
          <div className="card relative p-5 sm:p-6">
            {gain !== null && <div className="animate-pop absolute -top-3 right-4 rounded-full bg-accent px-3 py-1 text-sm font-bold text-white">+{gain}</div>}
            {timedOut && <div className="animate-pop absolute -top-3 right-4 rounded-full bg-error px-3 py-1 text-sm font-bold text-white">{t('games:speedreview.tooSlow')}</div>}
            <QuestionPanel key={index} prompt={q.prompt} options={q.options} correct={q.correct} onChoose={onChoose} onAnswer={() => advance()} revealed={timedOut} disabled={!visible} feedbackMs={800} />
          </div>
          <p className="text-center text-xs text-muted">{t('games:common.keyboardHint', { keys: '1 2 3 4' })}</p>
        </div>
      )}
      {phase === 'end' && result && (
        <GameEnd setId={setId} scoreLabel={t('games:common.score')} score={score} best={formatBest('speedreview', result.best)} isNewBest={result.isNewBest} onPlayAgain={start}>
          <div className="text-sm text-muted">{t('games:speedreview.correctCount', { correct: correctCount, total: questions.length })}</div>
          <div className="mt-4 text-left">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('games:common.missedTerms')}</div>
            {missed.length === 0 ? (
              <p className="text-sm text-accent">{t('games:common.noMissed')}</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {[...new Map(missed.map((c) => [c.id, c])).values()].map((c) => (
                  <li key={c.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:gap-3">
                    <span className="font-semibold sm:w-1/3">{c.term}</span>
                    <span className="text-muted">{c.definition}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </GameEnd>
      )}
    </GameLayout>
  )
}
