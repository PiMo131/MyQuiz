import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { mulberry32 } from '@/domain/text'
import { gradeAnswer } from '@/domain/grading'
import type { Card } from '@/domain/types'
import { BLOCKS_GRID, anyFits, canPlace, emptyGrid, footprint, placeShape, randomTray, shapeBounds, type Cell, type Grid, type Shape } from '@/domain/games/blocks'
import { acceptedAnswers, answerOf, buildChoices, cardCycler, promptOf } from '@/domain/games/questions'
import { Button, Input, cn } from '@/ui'
import { useSettings } from '@/app/settings-store'
import {
  DEFAULT_GAME_OPTIONS,
  GameEnd,
  GameHeader,
  GameIntro,
  GameLayout,
  GameStatus,
  Hud,
  QuestionPanel,
  formatBest,
  gameMeta,
  useBestScore,
  useGameCards,
  useGameOptions,
  useGameSession,
  useSfx,
  type BaseGameOptions,
} from '../shared'

const COLORS = ['#818cf8', '#60a5fa', '#38bdf8', '#22d3ee', '#2dd4bf', '#34d399', '#a3e635', '#facc15', '#fb923c', '#f87171', '#f472b6', '#e879f9', '#a78bfa', '#fbbf24']

interface BlocksOptions extends BaseGameOptions {
  answerMode: 'typed' | 'mc'
}
const DEFAULTS: BlocksOptions = { ...DEFAULT_GAME_OPTIONS, answerMode: 'typed' }

type Phase = 'intro' | 'play' | 'end'
type TrayPiece = { uid: number; shape: Shape } | null

interface Drag {
  uid: number
  shape: Shape
  /** pointer position (client px) */
  x: number
  y: number
  /** grab offset within piece in cells */
  offR: number
  offC: number
  touch: boolean
  /** board cell size in px at drag start */
  cs: number
  target: { row: number; col: number; ok: boolean } | null
}

interface Question {
  card: Card
  prompt: string
  answers: string[]
  options: string[]
  correct: string
}

export default function BlocksPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation(['games', 'common'])
  const [opts, setOpts] = useGameOptions<BlocksOptions>('blocks', DEFAULTS)
  const { set, cards, loading } = useGameCards(setId, opts.starredOnly)
  const best = useBestScore(setId, 'blocks')
  const session = useGameSession(setId, 'blocks')
  const grading = useSettings((s) => s.settings.grading)
  const play = useSfx()

  const [phase, setPhase] = useState<Phase>('intro')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [grid, setGrid] = useState<Grid>(() => emptyGrid())
  const [tray, setTray] = useState<TrayPiece[]>([])
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [flashCells, setFlashCells] = useState<Cell[]>([])
  const [drag, setDrag] = useState<Drag | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState<{ ok: boolean; answer: string } | null>(null)
  const [result, setResult] = useState<{ best: number; isNewBest: boolean } | null>(null)
  const [reward, setReward] = useState(3)
  const uidRef = useRef(1)
  const rngRef = useRef(mulberry32(1))
  const nextCard = useRef<() => Card>(() => cards[0])
  const boardRef = useRef<HTMLDivElement>(null)
  const askedAt = useRef(0)

  const newTray = useCallback((n: number): TrayPiece[] => randomTray(rngRef.current, n).map((shape) => ({ uid: uidRef.current++, shape })), [])

  const start = useCallback(() => {
    const seed = Date.now() & 0xfffff
    rngRef.current = mulberry32(seed)
    nextCard.current = cardCycler(cards, rngRef.current)
    setReward(3)
    setGrid(emptyGrid())
    setTray(newTray(3))
    setScore(0)
    setCombo(0)
    setQuestion(null)
    setFeedback(null)
    setResult(null)
    setPhase('play')
    void session.begin({ starredOnly: opts.starredOnly, answerMode: opts.answerMode })
  }, [cards, newTray, opts.answerMode, opts.starredOnly, session])

  const makeQuestion = useCallback((): Question => {
    const card = nextCard.current()
    const options = buildChoices(cards, card, opts.promptSide, rngRef.current, 4)
    const answers = acceptedAnswers(card, opts.promptSide)
    const correct = answerOf(card, opts.promptSide)
    askedAt.current = performance.now()
    return { card, prompt: promptOf(card, opts.promptSide), answers, options, correct }
  }, [cards, opts.promptSide])

  const finish = useCallback(
    (finalScore: number) => {
      void session.end(finalScore).then((r) => {
        setResult(r)
        setPhase('end')
      })
    },
    [session],
  )

  // game over when no tray piece fits anywhere (question creation happens in the drop handler)
  useEffect(() => {
    if (phase !== 'play' || drag || question || feedback) return
    const alive = tray.filter((p): p is NonNullable<TrayPiece> => p !== null)
    if (alive.length > 0 && !anyFits(grid, alive.map((p) => p.shape))) {
      play('lose')
      finish(score)
    }
  }, [tray, grid, phase, drag, question, feedback, finish, score, play])

  const resolveAnswer = useCallback(
    (given: string, ok: boolean) => {
      if (!question) return
      const dur = Math.round(performance.now() - askedAt.current)
      session.answer(question.card, ok, given, question.answers[0], opts.promptSide, dur)
      const count = ok ? 3 : Math.max(1, reward - 1)
      setReward(count)
      setFeedback({ ok, answer: question.answers[0] })
      play(ok ? 'correct' : 'wrong')
      window.setTimeout(
        () => {
          setFeedback(null)
          setQuestion(null)
          setTray(newTray(count))
        },
        ok ? 700 : 1600,
      )
    },
    [newTray, opts.promptSide, play, question, reward, session],
  )

  const submitTyped = () => {
    if (!question || feedback) return
    const g = gradeAnswer(typed, question.answers, grading)
    resolveAnswer(typed, g.correct)
  }

  // ----- drag & drop -----
  const computeTarget = useCallback((d: Drag, x: number, y: number) => {
    const el = boardRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const cs = rect.width / BLOCKS_GRID
    const lift = d.touch ? 1.6 * cs : 0
    const topLeftX = x - d.offC * cs
    const topLeftY = y - lift - d.offR * cs
    const col = Math.round((topLeftX - rect.left) / cs)
    const row = Math.round((topLeftY - rect.top) / cs)
    const { rows, cols } = shapeBounds(d.shape)
    if (row < -1 || col < -1 || row > BLOCKS_GRID - rows + 1 || col > BLOCKS_GRID - cols + 1) return null
    return { row, col, ok: canPlace(grid, d.shape, row, col) }
  }, [grid])

  const onPiecePointerDown = (e: ReactPointerEvent<HTMLDivElement>, piece: NonNullable<TrayPiece>) => {
    if (phase !== 'play' || question) return
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const rect = target.getBoundingClientRect()
    const { rows, cols } = shapeBounds(piece.shape)
    const offC = ((e.clientX - rect.left) / rect.width) * cols
    const offR = ((e.clientY - rect.top) / rect.height) * rows
    const cs = boardRef.current ? boardRef.current.getBoundingClientRect().width / BLOCKS_GRID : 40
    const d: Drag = { uid: piece.uid, shape: piece.shape, x: e.clientX, y: e.clientY, offR, offC, touch: e.pointerType === 'touch', cs, target: null }
    d.target = computeTarget(d, e.clientX, e.clientY)
    setDrag(d)
    play('select')
  }

  const onPiecePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, target: computeTarget(d, e.clientX, e.clientY) } : d))
  }

  const onPiecePointerUp = () => {
    if (!drag) return
    const tgt = drag.target
    if (tgt?.ok) {
      const res = placeShape(grid, drag.shape, tgt.row, tgt.col, combo)
      const lines = res.clearedRows.length + res.clearedCols.length
      setGrid(res.grid)
      setScore((s) => s + res.points)
      setCombo(lines > 0 ? combo + 1 : 0)
      const nextTray = tray.map((p) => (p && p.uid === drag.uid ? null : p))
      setTray(nextTray)
      if (nextTray.every((p) => p === null)) {
        setQuestion(makeQuestion())
        setTyped('')
      }
      if (lines > 0) {
        play('clear')
        setFlashCells(res.clearedCells)
        window.setTimeout(() => setFlashCells([]), 350)
      } else play('place')
    }
    setDrag(null)
  }

  const preview = useMemo(() => {
    if (!drag?.target?.ok) return new Set<string>()
    return new Set(footprint(drag.shape, drag.target.row, drag.target.col).map(([r, c]) => `${r},${c}`))
  }, [drag])
  const flashSet = useMemo(() => new Set(flashCells.map(([r, c]) => `${r},${c}`)), [flashCells])

  const meta = gameMeta('blocks')
  const enough = cards.length >= meta.minCards
  const cs = drag?.cs ?? 0

  return (
    <GameLayout header={<GameHeader setId={setId} game="blocks" center={set?.title} onOptions={phase === 'intro' ? () => setOptionsOpen(true) : undefined} />}>
      <GameStatus loading={loading} found={!!set} />
      {!loading && set && phase === 'intro' && (
        <GameIntro
          game="blocks"
          onPlay={start}
          options={opts}
          onOptions={setOpts}
          disabled={!enough}
          disabledReason={t('games:common.notEnoughCards', { count: meta.minCards })}
          optionsOpen={optionsOpen}
          onOptionsOpenChange={setOptionsOpen}
          extraOptions={
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="text-sm font-medium">{t('games:common.answerMode')}</div>
              <div className="flex rounded-full bg-surface-2 p-1" role="radiogroup">
                {(['typed', 'mc'] as const).map((m) => (
                  <button key={m} role="radio" aria-checked={opts.answerMode === m} onClick={() => setOpts({ answerMode: m })} className={cn('rounded-full px-3 py-1 text-sm font-medium', opts.answerMode === m ? 'bg-surface text-text shadow' : 'text-muted')}>
                    {m === 'mc' ? t('games:common.multipleChoice') : t('games:common.typed')}
                  </button>
                ))}
              </div>
            </div>
          }
        />
      )}
      {phase === 'play' && (
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-3 sm:p-5">
          <Hud score={score} best={formatBest('blocks', best)} center={combo > 1 ? `×${combo}` : undefined} className="max-w-none px-0" />
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center">
            {/* board */}
            <div
              ref={boardRef}
              className="grid aspect-square w-full max-w-[min(92vw,480px)] shrink-0 touch-none select-none grid-cols-8 gap-1 rounded-2xl bg-surface-2/60 p-1.5 dark:bg-surface"
              style={{ gridTemplateRows: 'repeat(8, minmax(0, 1fr))' }}
              role="grid"
              aria-label="Blocks"
            >
              {grid.map((row, r) =>
                row.map((v, c) => {
                  const key = `${r},${c}`
                  const prev = preview.has(key)
                  const flash = flashSet.has(key)
                  return (
                    <div
                      key={key}
                      role="gridcell"
                      className={cn('rounded-md border border-border/50 transition-colors', v === 0 && !prev && 'bg-surface dark:bg-surface-2/60', prev && 'bg-primary/40 border-primary', flash && 'animate-pop bg-white')}
                      style={v !== 0 && !flash ? { background: COLORS[(v - 1) % COLORS.length], boxShadow: 'inset 0 -3px 0 rgb(0 0 0 / .18)' } : undefined}
                    />
                  )
                }),
              )}
            </div>
            {/* tray / question */}
            <div className="flex w-full max-w-[min(92vw,480px)] flex-col gap-3 sm:w-64">
              {question ? (
                <div className="card animate-pop flex flex-col gap-3 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('games:blocks.answerForPieces')}</div>
                  {opts.answerMode === 'mc' ? (
                    <QuestionPanel prompt={question.prompt} options={question.options} correct={question.correct} onAnswer={(g, ok) => resolveAnswer(g, ok)} disabled={!!feedback} compact feedbackMs={10} />
                  ) : (
                    <>
                      <div className="text-base font-semibold">{question.prompt}</div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          submitTyped()
                        }}
                        className="flex flex-col gap-2"
                      >
                        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('games:common.typeAnswer')} autoFocus disabled={!!feedback} aria-label={t('games:common.typeAnswer')} />
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} disabled={!!feedback} onClick={() => { setQuestion(makeQuestion()); setTyped('') }}>
                            {t('games:common.refresh')}
                          </Button>
                          <Button type="submit" size="sm" disabled={!!feedback || !typed.trim()}>
                            {t('games:common.submit')}
                          </Button>
                        </div>
                      </form>
                    </>
                  )}
                  {feedback && (
                    <div className={cn('rounded-xl px-3 py-2 text-sm font-medium', feedback.ok ? 'bg-accent-soft text-accent' : 'bg-error-soft text-error')} aria-live="polite">
                      {feedback.ok ? t('games:blocks.pieceReward', { count: 3 }) : (
                        <>
                          {t('games:blocks.pieceLoss', { count: reward })}
                          <div className="mt-1 text-text">{t('games:common.correctAnswer')}: <strong>{feedback.answer}</strong></div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-row justify-around gap-3 sm:flex-col sm:items-center">
                  {tray.map((p, i) =>
                    p ? (
                      <div
                        key={p.uid}
                        className={cn('touch-none select-none', drag?.uid === p.uid && 'opacity-30')}
                        onPointerDown={(e) => onPiecePointerDown(e, p)}
                        onPointerMove={onPiecePointerMove}
                        onPointerUp={onPiecePointerUp}
                        onPointerCancel={() => setDrag(null)}
                        role="button"
                        aria-label={`${t('games:blocks.pieces')} ${i + 1}`}
                        tabIndex={0}
                      >
                        <PieceView shape={p.shape} cell={22} />
                      </div>
                    ) : (
                      <div key={`empty-${i}`} className="h-16 w-16" />
                    ),
                  )}
                </div>
              )}
              {!question && <p className="text-center text-xs text-muted">{t('games:blocks.dragHint')}</p>}
            </div>
          </div>
          {drag && (
            <div className="pointer-events-none fixed z-50" style={{ left: drag.x - drag.offC * cs, top: drag.y - (drag.touch ? 1.6 * cs : 0) - drag.offR * cs }}>
              <PieceView shape={drag.shape} cell={cs} gap={4} />
            </div>
          )}
        </div>
      )}
      {phase === 'end' && result && (
        <GameEnd setId={setId} scoreLabel={t('games:common.score')} score={score} best={formatBest('blocks', result.best)} isNewBest={result.isNewBest} onPlayAgain={start} lost>
          <p className="text-sm text-muted">{t('games:blocks.noMoves')}</p>
        </GameEnd>
      )}
    </GameLayout>
  )
}

function PieceView({ shape, cell, gap = 3 }: { shape: Shape; cell: number; gap?: number }) {
  const { rows, cols } = shapeBounds(shape)
  return (
    <div className="relative" style={{ width: cols * cell, height: rows * cell }}>
      {shape.cells.map(([r, c]) => (
        <div
          key={`${r}-${c}`}
          className="absolute rounded-md"
          style={{ left: c * cell + gap / 2, top: r * cell + gap / 2, width: cell - gap, height: cell - gap, background: COLORS[shape.color % COLORS.length], boxShadow: 'inset 0 -3px 0 rgb(0 0 0 / .18)' }}
        />
      ))}
    </div>
  )
}
