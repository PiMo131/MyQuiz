import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { mulberry32 } from '@/domain/text'
import { createMatch, formatTenths, isMatchComplete, selectTile, type MatchState } from '@/domain/games/match'
import { cn } from '@/ui'
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
  useBestScore,
  useDocumentVisible,
  useGameCards,
  useGameOptions,
  useGameSession,
  useKeydown,
  useSfx,
  useStopwatch,
} from '../shared'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']
type Phase = 'intro' | 'play' | 'end'

export default function MatchPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation(['games', 'common'])
  const [opts, setOpts] = useGameOptions('match', DEFAULT_GAME_OPTIONS)
  const { set, cards, loading } = useGameCards(setId, opts.starredOnly)
  const best = useBestScore(setId, 'match')
  const session = useGameSession(setId, 'match')
  const play = useSfx()
  const visible = useDocumentVisible()

  const [phase, setPhase] = useState<Phase>('intro')
  const [seed, setSeed] = useState(() => Date.now() & 0xffff)
  const [state, setState] = useState<MatchState | null>(null)
  const [flash, setFlash] = useState(false)
  const [shaking, setShaking] = useState<string[]>([])
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [result, setResult] = useState<{ time: number; best: number; isNewBest: boolean } | null>(null)
  const wrongCards = useRef(new Set<string>())
  const complete = state ? isMatchComplete(state) : false
  const elapsed = useStopwatch(phase === 'play' && !complete, seed)
  const total = elapsed + (state?.penaltyMs ?? 0)

  const start = useCallback(() => {
    const s = (Date.now() & 0xffff) ^ Math.floor(Math.random() * 0xffff)
    setSeed(s)
    setState(createMatch(cards, mulberry32(s)))
    wrongCards.current = new Set()
    setResult(null)
    setPhase('play')
    void session.begin({ starredOnly: opts.starredOnly })
  }, [cards, opts.starredOnly, session])

  const onSelect = useCallback(
    (tileId: string) => {
      setState((prev) => {
        if (!prev) return prev
        const next = selectTile(prev, tileId)
        if (next.lastEvent === 'select') play('select')
        if (next.lastEvent === 'correct') play('correct')
        if (next.lastEvent === 'wrong') {
          play('wrong')
          for (const id of next.lastTiles) {
            const tile = prev.tiles.find((x) => x.id === id)
            if (tile) wrongCards.current.add(tile.cardId)
          }
          setFlash(true)
          setShaking(next.lastTiles)
          window.setTimeout(() => setFlash(false), 700)
          window.setTimeout(() => setShaking([]), 400)
        }
        return next
      })
    },
    [play],
  )

  useKeydown((e) => {
    if (phase !== 'play' || !state) return
    const idx = KEYS.indexOf(e.key)
    if (idx >= 0 && idx < state.tiles.length) {
      e.preventDefault()
      onSelect(state.tiles[idx].id)
    }
  }, phase === 'play')

  // finish
  useEffect(() => {
    if (phase !== 'play' || !state || !complete) return
    const finalTime = Math.round(total)
    const cardIds = [...new Set(state.tiles.map((x) => x.cardId))]
    for (const id of cardIds) {
      const card = cards.find((c) => c.id === id)
      if (card) session.answer(card, !wrongCards.current.has(id), card.definition, card.definition, 'term')
    }
    void session.end(finalTime, state.pairs).then((r) => {
      setResult({ time: finalTime, ...r })
      setPhase('end')
    })
  }, [complete])

  const meta = gameMeta('match')
  const enough = cards.length >= meta.minCards
  const center = useMemo(() => {
    if (phase === 'play') return <span className={cn('text-xl tabular-nums transition-colors', flash && 'text-highlight')}>{formatTenths(total)}</span>
    return set?.title
  }, [phase, total, flash, set?.title])

  return (
    <GameLayout header={<GameHeader setId={setId} game="match" center={center} onOptions={phase === 'intro' ? () => setOptionsOpen(true) : undefined} />}>
      <GameStatus loading={loading} found={!!set} />
      {!loading && set && phase === 'intro' && (
        <GameIntro
          game="match"
          onPlay={start}
          options={opts}
          onOptions={setOpts}
          hidePromptSide
          disabled={!enough}
          disabledReason={t('games:common.notEnoughCards', { count: meta.minCards })}
          optionsOpen={optionsOpen}
          onOptionsOpenChange={setOptionsOpen}
        />
      )}
      {phase === 'play' && state && (
        <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col p-3 sm:p-5">
          {!visible && <PausedOverlay label={t('games:common.paused')} />}
          {flash && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-highlight px-3 py-1 text-sm font-bold text-white animate-pop">
              {t('games:match.penalty')}
            </div>
          )}
          <div className="grid flex-1 grid-cols-3 grid-rows-4 gap-2 sm:grid-cols-4 sm:grid-rows-3 sm:gap-3" role="grid" aria-label="Match">
            {state.tiles.map((tile, i) => {
              const matched = state.matched.includes(tile.id)
              const selected = state.selected === tile.id
              const shake = shaking.includes(tile.id)
              return (
                <button
                  key={tile.id}
                  role="gridcell"
                  aria-pressed={selected}
                  aria-hidden={matched}
                  tabIndex={matched ? -1 : 0}
                  onClick={() => onSelect(tile.id)}
                  disabled={matched}
                  className={cn(
                    'card flex min-h-20 items-center justify-center p-2 text-center text-sm font-medium leading-snug transition-all duration-300 sm:p-4 sm:text-base',
                    'hover:border-primary/60 focus-visible:border-primary',
                    selected && 'border-primary bg-primary-soft ring-2 ring-primary/40',
                    shake && 'animate-shake border-error bg-error-soft',
                    matched && 'pointer-events-none scale-90 opacity-0',
                  )}
                >
                  <span className="pointer-events-none absolute left-1.5 top-1 hidden text-[10px] font-bold text-faint sm:block">{KEYS[i]}</span>
                  <span className="line-clamp-6 break-words">{tile.text}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {phase === 'end' && result && (
        <GameEnd
          setId={setId}
          title={result.isNewBest ? t('games:common.newBest') : t('games:common.gameOver')}
          scoreLabel={t('games:match.yourTime')}
          score={`${formatTenths(result.time)} s`}
          bestLabel={t('games:common.bestTime')}
          best={formatBest('match', result.best ?? best)}
          isNewBest={result.isNewBest}
          onPlayAgain={start}
        >
          {state && state.wrong > 0 && <p className="text-sm text-muted">{t('games:match.wrongMatches', { count: state.wrong })}</p>}
        </GameEnd>
      )}
    </GameLayout>
  )
}
