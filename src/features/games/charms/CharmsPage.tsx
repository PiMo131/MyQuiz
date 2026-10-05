import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { mulberry32 } from '@/domain/text'
import type { Card } from '@/domain/types'
import {
  CHARM_COLS,
  CHARM_DEFAULT_BONUS,
  CHARM_ROWS,
  CHARM_START_MOVES,
  clearCells,
  createCharmBoard,
  findGroup,
  groupScore,
  hasValidGroup,
  reshuffleBoard,
  type CharmBoard,
  type CharmRng,
} from '@/domain/games/charms'
import { answerOf, buildChoices, cardCycler, promptOf } from '@/domain/games/questions'
import { Modal, cn } from '@/ui'
import {
  DEFAULT_GAME_OPTIONS,
  GameEnd,
  GameHeader,
  GameIntro,
  GameLayout,
  GameStatus,
  Hud,
  QuestionPanel,
  burstAt,
  formatBest,
  gameMeta,
  useBestScore,
  useGameCards,
  useGameOptions,
  useGameSession,
  useSfx,
} from '../shared'

type Phase = 'intro' | 'play' | 'end'

interface Question {
  card: Card
  prompt: string
  options: string[]
  correct: string
  bonus: number
}

const CHARM_COLORS = ['#f472b6', '#facc15', '#a5b4fc', '#22d3ee', '#fb923c', '#4ade80']

export default function CharmsPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation(['games', 'common'])
  const [opts, setOpts] = useGameOptions('charms', DEFAULT_GAME_OPTIONS)
  const { set, cards, loading } = useGameCards(setId, opts.starredOnly)
  const best = useBestScore(setId, 'charms')
  const session = useGameSession(setId, 'charms')
  const play = useSfx()

  const [phase, setPhase] = useState<Phase>('intro')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [board, setBoard] = useState<CharmBoard>([])
  const [moves, setMoves] = useState(CHARM_START_MOVES)
  const [score, setScore] = useState(0)
  const [clears, setClears] = useState(0)
  const [question, setQuestion] = useState<Question | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [shake, setShake] = useState<string | null>(null)
  const [result, setResult] = useState<{ best: number; isNewBest: boolean; reason: 'moves' | 'groups' } | null>(null)
  const ctx = useRef<CharmRng>({ rng: mulberry32(1), nextId: 1 })
  const nextCard = useRef<() => Card>(() => cards[0])
  const reshuffled = useRef(false)
  const askedAt = useRef(0)
  const boardRef = useRef<HTMLDivElement>(null)

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1200)
  }

  const start = useCallback(() => {
    ctx.current = { rng: mulberry32(Date.now() & 0xfffff), nextId: 1 }
    nextCard.current = cardCycler(cards, ctx.current.rng)
    reshuffled.current = false
    setBoard(createCharmBoard(ctx.current, CHARM_ROWS, CHARM_COLS))
    setMoves(CHARM_START_MOVES)
    setScore(0)
    setClears(0)
    setQuestion(null)
    setResult(null)
    setPhase('play')
    void session.begin({ starredOnly: opts.starredOnly, promptSide: opts.promptSide })
  }, [cards, opts.promptSide, opts.starredOnly, session])

  const finish = useCallback(
    (finalScore: number, reason: 'moves' | 'groups') => {
      void session.end(finalScore).then((r) => {
        setResult({ ...r, reason })
        setPhase('end')
      })
    },
    [session],
  )

  // end conditions (evaluated when no question is open)
  useEffect(() => {
    if (phase !== 'play' || question || board.length === 0) return
    if (moves <= 0) {
      finish(score, 'moves')
      return
    }
    if (!hasValidGroup(board)) {
      if (!reshuffled.current) {
        reshuffled.current = true
        const next = reshuffleBoard(board, ctx.current.rng)
        if (hasValidGroup(next)) {
          notify(t('games:charms.reshuffled'))
          setBoard(next)
          return
        }
      }
      finish(score, 'groups')
    }
  }, [board, moves, phase, question, score, finish, t])

  const askQuestion = (bonus: number) => {
    const card = nextCard.current()
    const options = buildChoices(cards, card, opts.promptSide, ctx.current.rng, 4)
    askedAt.current = performance.now()
    setQuestion({ card, prompt: promptOf(card, opts.promptSide), options, correct: answerOf(card, opts.promptSide), bonus })
  }

  const tap = (r: number, c: number, e?: React.MouseEvent) => {
    if (phase !== 'play' || question || moves <= 0) return
    const group = findGroup(board, r, c)
    if (group.length < 2) {
      play('wrong')
      setShake(`${r},${c}`)
      window.setTimeout(() => setShake(null), 350)
      return
    }
    const pts = groupScore(group.length)
    const res = clearCells(board, group, ctx.current)
    play(group.length >= 4 ? 'clear' : 'pop')
    if (e && boardRef.current) burstAt(e.clientX / window.innerWidth, e.clientY / window.innerHeight, [CHARM_COLORS[board[r][c].type]])
    setBoard(res.board)
    setScore((s) => s + pts)
    setMoves((m) => m - 1)
    const n = clears + 1
    setClears(n)
    const bonus = res.bonusMoves > 0 ? res.bonusMoves : n % 3 === 0 ? CHARM_DEFAULT_BONUS : 0
    if (bonus > 0) window.setTimeout(() => askQuestion(bonus), 350)
  }

  const answer = (given: string, ok: boolean) => {
    if (!question) return
    session.answer(question.card, ok, given, question.correct, opts.promptSide, Math.round(performance.now() - askedAt.current))
    if (ok) {
      setMoves((m) => m + question.bonus)
      setScore((s) => s + 50)
      notify(t('games:charms.earnMoves', { count: question.bonus }))
    } else notify(t('games:charms.noBonus'))
    setQuestion(null)
  }

  const meta = gameMeta('charms')
  const enough = cards.length >= meta.minCards
  const cellPct = 100 / CHARM_COLS
  const rowPct = 100 / CHARM_ROWS
  const charms = useMemo(() => board.flatMap((row, r) => row.map((ch, c) => ({ ch, r, c }))).sort((a, b) => a.ch.id - b.ch.id), [board])

  return (
    <GameLayout header={<GameHeader setId={setId} game="charms" center={set?.title} onOptions={phase === 'intro' ? () => setOptionsOpen(true) : undefined} />}>
      <GameStatus loading={loading} found={!!set} />
      {!loading && set && phase === 'intro' && (
        <GameIntro game="charms" onPlay={start} options={opts} onOptions={setOpts} disabled={!enough} disabledReason={t('games:common.notEnoughCards', { count: meta.minCards })} optionsOpen={optionsOpen} onOptionsOpenChange={setOptionsOpen} />
      )}
      {phase === 'play' && (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-3 p-3 sm:p-5">
          <Hud score={score} best={formatBest('charms', best)} center={<span title={t('games:common.moves')}>{moves}</span>} className="px-0" />
          <div className="relative w-full">
            {toast && <div className="animate-pop pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-white shadow-pop">{toast}</div>}
            <div
              ref={boardRef}
              className="relative w-full select-none rounded-2xl bg-surface-2/70 p-1.5 dark:bg-[#1b1a4a]"
              style={{ aspectRatio: `${CHARM_COLS} / ${CHARM_ROWS}` }}
              role="grid"
              aria-label="Charms"
            >
              {charms.map(({ ch, r, c }) => (
                <button
                  key={ch.id}
                  role="gridcell"
                  aria-label={`${t('games:common.moves')} ${r + 1},${c + 1}`}
                  onClick={(e) => tap(r, c, e)}
                  className={cn('absolute transition-transform duration-300 ease-out', shake === `${r},${c}` && 'animate-shake')}
                  style={{ width: `${cellPct}%`, height: `${rowPct}%`, left: 0, top: 0, transform: `translate(${c * 100}%, ${r * 100}%)` }}
                >
                  <CharmShape type={ch.type} bonus={ch.bonus} />
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted">{t('games:charms.movesLeft', { count: moves })}</p>
        </div>
      )}
      {question && (
        <Modal open onClose={() => answer('', false)} title={t('games:charms.bonusQuestion')} size="md">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-highlight-soft px-3 py-1 text-xs font-semibold text-highlight">+{question.bonus} {t('games:common.moves').toLowerCase()}</div>
          <QuestionPanel prompt={question.prompt} options={question.options} correct={question.correct} onAnswer={answer} />
        </Modal>
      )}
      {phase === 'end' && result && (
        <GameEnd setId={setId} scoreLabel={t('games:common.score')} score={score} best={formatBest('charms', result.best)} isNewBest={result.isNewBest} onPlayAgain={start} lost={!result.isNewBest}>
          <p className="text-sm text-muted">
            {result.reason === 'moves' ? t('games:charms.outOfMoves') : t('games:charms.noGroups')} · {t('games:charms.clears', { count: clears })}
          </p>
        </GameEnd>
      )}
    </GameLayout>
  )
}

/** 6 charm types: circle, hexagon, rounded square, diamond, teardrop, triangle. */
function CharmShape({ type, bonus }: { type: number; bonus?: number }) {
  const color = CHARM_COLORS[type % CHARM_COLORS.length]
  const shapes = [
    <circle key="c" cx="50" cy="50" r="40" />,
    <polygon key="h" points="50,8 86,29 86,71 50,92 14,71 14,29" />,
    <rect key="s" x="12" y="12" width="76" height="76" rx="18" />,
    <polygon key="d" points="50,6 94,50 50,94 6,50" />,
    <path key="t" d="M50 6 C70 30 90 48 90 64 A40 40 0 0 1 10 64 C10 48 30 30 50 6Z" />,
    <polygon key="tri" points="50,10 92,84 8,84" />,
  ]
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-[7%] h-[86%] w-[86%] drop-shadow-sm" aria-hidden>
      <g fill={color} stroke="rgba(0,0,0,0.15)" strokeWidth="3">
        {shapes[type % shapes.length]}
      </g>
      <g fill="rgba(255,255,255,0.35)">
        <ellipse cx="38" cy="34" rx="12" ry="7" transform="rotate(-30 38 34)" />
      </g>
      {bonus && (
        <text x="50" y="56" textAnchor="middle" dominantBaseline="middle" fontSize="40" fontWeight="800" fill="#fff" stroke="rgba(0,0,0,0.35)" strokeWidth="2" fontFamily="Inter, sans-serif">
          {bonus}
        </text>
      )}
    </svg>
  )
}
