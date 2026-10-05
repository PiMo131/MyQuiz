import { useCallback, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Delete } from 'lucide-react'
import { mulberry32 } from '@/domain/text'
import type { Card } from '@/domain/types'
import {
  HANGMAN_MAX_WRONG,
  KEYBOARD_ROWS,
  createHangman,
  giveUp,
  guessLetter,
  isGuessable,
  isHangmanOver,
  isLost,
  isWon,
  letterInWord,
  maskedWord,
  normalizeLetter,
  wordScore,
  type HangmanState,
} from '@/domain/games/hangman'
import { answerOf, cardCycler, promptOf } from '@/domain/games/questions'
import { Button, cn } from '@/ui'
import {
  DEFAULT_GAME_OPTIONS,
  GameEnd,
  GameHeader,
  GameIntro,
  GameLayout,
  GameStatus,
  Hud,
  formatBest,
  gameMeta,
  useBestScore,
  useGameCards,
  useGameOptions,
  useGameSession,
  useKeydown,
  useSfx,
  type BaseGameOptions,
} from '../shared'

type Phase = 'intro' | 'play' | 'end'
const WORDS_PER_ROUND = 10

export default function HangmanPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation(['games', 'common'])
  const [opts, setOpts] = useGameOptions<BaseGameOptions>('hangman', { ...DEFAULT_GAME_OPTIONS, promptSide: 'definition' })
  const { set, cards: allPlayable, loading } = useGameCards(setId, opts.starredOnly)
  const cards = useMemo(() => allPlayable.filter((c) => { const a = answerOf(c, opts.promptSide); return isGuessable(a) && a.length <= 40 }), [allPlayable, opts.promptSide])
  const best = useBestScore(setId, 'hangman')
  const session = useGameSession(setId, 'hangman')
  const play = useSfx()

  const [phase, setPhase] = useState<Phase>('intro')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [card, setCard] = useState<Card | null>(null)
  const [state, setState] = useState<HangmanState | null>(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [solved, setSolved] = useState(0)
  const [wordIndex, setWordIndex] = useState(0)
  const [result, setResult] = useState<{ best: number; isNewBest: boolean } | null>(null)
  const nextCard = useRef<() => Card>(() => cards[0])
  const startedAt = useRef(0)
  const total = Math.min(WORDS_PER_ROUND, cards.length)

  const loadWord = useCallback(() => {
    const c = nextCard.current()
    setCard(c)
    setState(createHangman(answerOf(c, opts.promptSide)))
    startedAt.current = performance.now()
  }, [opts.promptSide])

  const start = useCallback(() => {
    nextCard.current = cardCycler(cards, mulberry32(Date.now() & 0xfffff))
    setScore(0)
    setStreak(0)
    setSolved(0)
    setWordIndex(0)
    setResult(null)
    loadWord()
    setPhase('play')
    void session.begin({ starredOnly: opts.starredOnly, promptSide: opts.promptSide })
  }, [cards, loadWord, opts.promptSide, opts.starredOnly, session])

  const over = state ? isHangmanOver(state) : false
  const won = state ? isWon(state) : false

  /** Record the outcome once a word is finished (called from the guess / give-up handlers). */
  const settle = useCallback(
    (next: HangmanState) => {
      if (!card || !isHangmanOver(next)) return
      const w = isWon(next)
      const dur = Math.round(performance.now() - startedAt.current)
      session.answer(card, w, next.guessed.join(''), next.word, opts.promptSide, dur)
      if (w) {
        setScore((s) => s + wordScore(next) + streak * 5)
        setStreak((s) => s + 1)
        setSolved((s) => s + 1)
        play('win')
      } else {
        setStreak(0)
        play('lose')
      }
    },
    [card, opts.promptSide, play, session, streak],
  )

  const finish = useCallback(() => {
    void session.end(score, total).then((r) => {
      setResult(r)
      setPhase('end')
    })
  }, [score, session, total])

  const next = () => {
    if (wordIndex + 1 >= total) {
      finish()
      return
    }
    setWordIndex((i) => i + 1)
    loadWord()
  }

  const guess = (letter: string) => {
    if (!state || over) return
    const res = guessLetter(state, letter)
    if (res.result === 'hit') play('correct')
    else if (res.result === 'miss') play('wrong')
    setState(res.state)
    settle(res.state)
  }

  const surrender = () => {
    if (!state || over) return
    const next = giveUp(state)
    setState(next)
    settle(next)
  }

  useKeydown((e) => {
    if (phase !== 'play') return
    if (e.key === 'Enter' && over) {
      next()
      return
    }
    if (e.key.length === 1 && /\p{L}/u.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) guess(e.key)
  }, phase === 'play')

  const meta = gameMeta('hangman')
  const enough = cards.length >= meta.minCards
  const words = useMemo(() => {
    const masked = state ? maskedWord(state) : []
    const out: (typeof masked)[] = [[]]
    for (const ch of masked) {
      if (ch.space) out.push([])
      else out[out.length - 1].push(ch)
    }
    return out.filter((w) => w.length)
  }, [state])

  return (
    <GameLayout header={<GameHeader setId={setId} game="hangman" center={phase === 'play' ? `${wordIndex + 1} / ${total}` : set?.title} onOptions={phase === 'intro' ? () => setOptionsOpen(true) : undefined} />}>
      <GameStatus loading={loading} found={!!set} />
      {!loading && set && phase === 'intro' && (
        <GameIntro game="hangman" onPlay={start} options={opts} onOptions={setOpts} disabled={!enough} disabledReason={t('games:common.notEnoughCards', { count: meta.minCards })} optionsOpen={optionsOpen} onOptionsOpenChange={setOptionsOpen} />
      )}
      {phase === 'play' && state && card && (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-4 p-3 sm:p-5">
          <Hud score={score} best={formatBest('hangman', best)} center={streak > 1 ? `🔥 ${streak}` : undefined} className="px-0" />
          <div className="flex w-full flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Gallows wrong={state.wrong} lost={isLost(state)} />
            <div className="flex min-w-0 flex-1 flex-col items-center gap-4 text-center">
              <div className="card w-full px-4 py-3 text-base font-medium sm:text-lg">{promptOf(card, opts.promptSide)}</div>
              <div className="text-xs font-semibold text-muted">{t('games:hangman.wrongGuesses', { count: state.wrong, max: HANGMAN_MAX_WRONG })}</div>
              <div className="flex flex-wrap justify-center gap-x-5 gap-y-3" aria-label={t('common:common.term')} aria-live="polite">
                {words.map((w, wi) => (
                  <div key={wi} className="flex max-w-full flex-wrap justify-center gap-1.5">
                    {w.map((ch, i) => (
                      <span
                        key={i}
                        className={cn(
                          'grid h-9 w-7 place-items-center border-b-2 text-xl font-bold sm:h-10 sm:w-8',
                          ch.letter ? 'border-text' : 'border-transparent',
                          ch.shown && ch.letter && !state.guessed.includes(normalizeLetter(ch.ch)) && 'text-error',
                        )}
                      >
                        {ch.shown ? ch.ch : ''}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              {over && (
                <div className={cn('animate-pop rounded-xl px-4 py-2 text-sm font-semibold', won ? 'bg-accent-soft text-accent' : 'bg-error-soft text-error')} role="status">
                  {won ? `${t('games:hangman.solved')} +${wordScore(state) + (streak - 1) * 5}` : `${t('games:hangman.revealed')} ${state.word}`}
                </div>
              )}
            </div>
          </div>
          {/* keyboard */}
          <div className="mt-auto flex w-full flex-col items-center gap-1.5" role="group" aria-label={t('games:hangman.lettersUsed')}>
            {KEYBOARD_ROWS.map((row) => (
              <div key={row} className="flex w-full justify-center gap-1">
                {[...row].map((k) => {
                  const used = state.guessed.includes(k)
                  const hit = used && letterInWord(state.word, k)
                  return (
                    <button
                      key={k}
                      onClick={() => guess(k)}
                      disabled={used || over}
                      aria-label={k}
                      className={cn(
                        'h-11 flex-1 max-w-10 rounded-lg text-sm font-bold uppercase transition-colors sm:text-base',
                        !used && 'bg-surface-2 hover:bg-primary-soft',
                        used && hit && 'bg-accent text-white',
                        used && !hit && 'bg-error/70 text-white',
                        over && !used && 'opacity-40',
                      )}
                    >
                      {k}
                    </button>
                  )
                })}
              </div>
            ))}
            <div className="mt-2 flex gap-2">
              {over ? (
                <Button onClick={next} autoFocus>
                  {wordIndex + 1 >= total ? t('games:hangman.finish') : t('games:hangman.nextWord')}
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" leftIcon={<Delete size={14} />} onClick={surrender}>
                    {t('games:common.giveUp')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={finish}>
                    {t('games:hangman.finish')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {phase === 'end' && result && (
        <GameEnd setId={setId} scoreLabel={t('games:common.score')} score={score} best={formatBest('hangman', result.best)} isNewBest={result.isNewBest} onPlayAgain={start}>
          <p className="text-sm text-muted">{t('games:hangman.wordsSolved', { count: solved })}</p>
        </GameEnd>
      )}
    </GameLayout>
  )
}

/** Gallows drawing: 7 stages (head, body, arm, arm, leg, leg, face). */
function Gallows({ wrong, lost }: { wrong: number; lost: boolean }) {
  const s = 'stroke-text'
  return (
    <svg viewBox="0 0 140 160" className="h-44 w-40 shrink-0 sm:h-56 sm:w-48" aria-hidden>
      <g className={s} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M10 150h70M35 150V15h55v18" />
        <path d="M35 40l25-25" />
        {wrong >= 1 && <circle cx="90" cy="46" r="13" className="animate-pop" />}
        {wrong >= 2 && <path d="M90 59v40" className="animate-pop" />}
        {wrong >= 3 && <path d="M90 70l-20 18" className="animate-pop" />}
        {wrong >= 4 && <path d="M90 70l20 18" className="animate-pop" />}
        {wrong >= 5 && <path d="M90 99l-16 28" className="animate-pop" />}
        {wrong >= 6 && <path d="M90 99l16 28" className="animate-pop" />}
        {(wrong >= 7 || lost) && (
          <g className="stroke-error animate-pop" strokeWidth="3">
            <path d="M84 42l4 4M88 42l-4 4M92 42l4 4M96 42l-4 4" />
            <path d="M84 53q6-4 12 0" />
          </g>
        )}
      </g>
    </svg>
  )
}
