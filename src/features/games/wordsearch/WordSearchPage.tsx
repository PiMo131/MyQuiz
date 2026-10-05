import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { mulberry32 } from '@/domain/text'
import { formatTenths } from '@/domain/games/match'
import { answerOf, otherSide, promptOf } from '@/domain/games/questions'
import { generateWordSearch, lineCells, matchSelection, placementCells, snapToLine, type WordSearch } from '@/domain/games/wordsearch'
import { Button, cn } from '@/ui'
import {
  DEFAULT_GAME_OPTIONS,
  GameEnd,
  GameHeader,
  GameIntro,
  GameLayout,
  GameStatus,
  PausedOverlay,
  formatBest,
  gameMeta,
  useDocumentVisible,
  useGameCards,
  useGameOptions,
  useGameSession,
  useSfx,
  useStopwatch,
  type BaseGameOptions,
} from '../shared'

type Phase = 'intro' | 'play' | 'end'
const WORD_COLORS = ['#818cf8', '#34d399', '#f472b6', '#fbbf24', '#38bdf8', '#fb923c', '#a78bfa', '#4ade80', '#f87171', '#22d3ee']

export default function WordSearchPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation(['games', 'common'])
  const [opts, setOpts] = useGameOptions<BaseGameOptions>('wordsearch', { ...DEFAULT_GAME_OPTIONS, promptSide: 'definition' })
  const { set, cards, loading } = useGameCards(setId, opts.starredOnly)
  const session = useGameSession(setId, 'wordsearch')
  const play = useSfx()
  const visible = useDocumentVisible()

  const [phase, setPhase] = useState<Phase>('intro')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [ws, setWs] = useState<WordSearch | null>(null)
  const [found, setFound] = useState<string[]>([])
  const [sel, setSel] = useState<{ a: [number, number]; b: [number, number] } | null>(null)
  const [wrongFlash, setWrongFlash] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [seed, setSeed] = useState(0)
  const [result, setResult] = useState<{ time: number; best: number; isNewBest: boolean } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const done = !!ws && found.length >= ws.placements.length && ws.placements.length > 0
  const elapsed = useStopwatch(phase === 'play' && !done, seed)

  const hiddenSide = otherSide(opts.promptSide)

  const start = useCallback(() => {
    const s = Date.now() & 0xfffff
    const size = typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 12
    const words = cards.map((c) => ({ id: c.id, text: answerOf(c, opts.promptSide) }))
    const gen = generateWordSearch(words, size, mulberry32(s))
    setWs(gen)
    setFound([])
    setSel(null)
    setShowTerms(false)
    setResult(null)
    setSeed(s)
    setPhase('play')
    void session.begin({ starredOnly: opts.starredOnly, promptSide: opts.promptSide, size })
  }, [cards, opts.promptSide, opts.starredOnly, session])

  const cellAt = (e: { clientX: number; clientY: number }): [number, number] | null => {
    const el = boardRef.current
    if (!el || !ws) return null
    const rect = el.getBoundingClientRect()
    const cs = rect.width / ws.size
    const c = Math.floor((e.clientX - rect.left) / cs)
    const r = Math.floor((e.clientY - rect.top) / cs)
    if (r < 0 || c < 0 || r >= ws.size || c >= ws.size) return null
    return [r, c]
  }

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (done) return
    const cell = cellAt(e)
    if (!cell) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setSel({ a: cell, b: cell })
    play('select')
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!sel) return
    const el = boardRef.current
    if (!el || !ws) return
    const rect = el.getBoundingClientRect()
    const cs = rect.width / ws.size
    const raw: [number, number] = [Math.floor((e.clientY - rect.top) / cs), Math.floor((e.clientX - rect.left) / cs)]
    const snapped = snapToLine(sel.a, raw)
    const clamped: [number, number] = [Math.min(ws.size - 1, Math.max(0, snapped[0])), Math.min(ws.size - 1, Math.max(0, snapped[1]))]
    const fixed = snapToLine(sel.a, clamped)
    if (fixed[0] !== sel.b[0] || fixed[1] !== sel.b[1]) setSel({ a: sel.a, b: fixed })
  }
  const onUp = () => {
    if (!sel || !ws) return
    const p = matchSelection(ws, sel.a, sel.b)
    if (p && !found.includes(p.id)) {
      const nextFound = [...found, p.id]
      setFound(nextFound)
      play('correct')
      const card = cards.find((c) => c.id === p.id)
      if (card) session.answer(card, true, p.word, p.word, opts.promptSide, Math.round(elapsed))
      if (nextFound.length >= ws.placements.length) {
        const time = Math.round(elapsed)
        void session.end(time, ws.placements.length).then((r) => {
          setResult({ time, ...r })
          setPhase('end')
        })
      }
    } else if (sel.a[0] !== sel.b[0] || sel.a[1] !== sel.b[1]) {
      play('wrong')
      setWrongFlash(true)
      window.setTimeout(() => setWrongFlash(false), 300)
    }
    setSel(null)
  }

  const selCells = useMemo(() => new Set((sel ? lineCells(sel.a, sel.b) ?? [] : []).map(([r, c]) => `${r},${c}`)), [sel])
  const foundCells = useMemo(() => {
    const m = new Map<string, string>()
    if (!ws) return m
    ws.placements.forEach((p, i) => {
      if (!found.includes(p.id)) return
      for (const [r, c] of placementCells(p)) m.set(`${r},${c}`, WORD_COLORS[i % WORD_COLORS.length])
    })
    return m
  }, [ws, found])

  const meta = gameMeta('wordsearch')
  const enough = cards.length >= meta.minCards

  return (
    <GameLayout header={<GameHeader setId={setId} game="wordsearch" center={phase === 'play' ? <span className="text-xl tabular-nums">{formatTenths(elapsed)}</span> : set?.title} onOptions={phase === 'intro' ? () => setOptionsOpen(true) : undefined} />}>
      <GameStatus loading={loading} found={!!set} />
      {!loading && set && phase === 'intro' && (
        <GameIntro game="wordsearch" onPlay={start} options={opts} onOptions={setOpts} disabled={!enough} disabledReason={t('games:common.notEnoughCards', { count: meta.minCards })} optionsOpen={optionsOpen} onOptionsOpenChange={setOptionsOpen} />
      )}
      {phase === 'play' && ws && (
        <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-3 sm:p-5 lg:flex-row lg:items-start">
          {!visible && <PausedOverlay label={t('games:common.paused')} />}
          <div
            ref={boardRef}
            className={cn('grid aspect-square w-full max-w-[min(92vw,560px)] shrink-0 touch-none select-none gap-0.5 rounded-2xl bg-surface-2/70 p-1.5 transition-colors', wrongFlash && 'bg-error-soft')}
            style={{ gridTemplateColumns: `repeat(${ws.size}, minmax(0, 1fr))` }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setSel(null)}
            role="grid"
            aria-label="Word search"
          >
            {ws.grid.map((row, r) =>
              row.map((ch, c) => {
                const key = `${r},${c}`
                const color = foundCells.get(key)
                const selected = selCells.has(key)
                return (
                  <div
                    key={key}
                    role="gridcell"
                    className={cn('grid place-items-center rounded-md text-sm font-bold uppercase sm:text-base', selected && 'bg-primary text-white', !selected && !color && 'bg-surface')}
                    style={color && !selected ? { background: color, color: '#fff' } : undefined}
                  >
                    {ch}
                  </div>
                )
              }),
            )}
          </div>
          <aside className="flex w-full flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {t('games:wordsearch.clues')} · <span className="tabular-nums text-muted">{t('games:wordsearch.found', { found: found.length, total: ws.placements.length })}</span>
              </div>
              <Button variant="ghost" size="sm" leftIcon={showTerms ? <EyeOff size={14} /> : <Eye size={14} />} onClick={() => setShowTerms((v) => !v)} aria-pressed={showTerms}>
                {t('games:wordsearch.showTerms')}
              </Button>
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
              {ws.placements.map((p, i) => {
                const card = cards.find((c) => c.id === p.id)
                const isFound = found.includes(p.id)
                return (
                  <li key={p.id} className={cn('card flex items-start gap-2 px-3 py-2 text-sm transition-opacity', isFound && 'opacity-60')}>
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: isFound ? WORD_COLORS[i % WORD_COLORS.length] : 'var(--color-border)' }} />
                    <span className={cn('min-w-0 flex-1', isFound && 'line-through')}>{card ? promptOf(card, opts.promptSide) : p.word}</span>
                    {(showTerms || isFound) && <span className="shrink-0 font-mono text-xs font-bold uppercase text-muted">{card ? answerOf(card, hiddenSide === 'term' ? 'definition' : 'term') : p.word}</span>}
                  </li>
                )
              })}
            </ul>
            {ws.skipped.length > 0 && <p className="text-xs text-faint">{t('games:wordsearch.skippedWords', { count: ws.skipped.length })}</p>}
          </aside>
        </div>
      )}
      {phase === 'end' && result && (
        <GameEnd setId={setId} title={result.isNewBest ? t('games:common.newBest') : t('games:wordsearch.allFound')} scoreLabel={t('games:common.time')} score={`${formatTenths(result.time)} s`} bestLabel={t('games:common.bestTime')} best={formatBest('wordsearch', result.best)} isNewBest={result.isNewBest} onPlayAgain={start}>
          <p className="text-sm text-muted">{t('games:wordsearch.wordsFound', { count: found.length })}</p>
        </GameEnd>
      )}
    </GameLayout>
  )
}
