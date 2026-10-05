import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MatchTile } from '@/domain/live/protocol'
import { cn } from '@/ui'

/** Local match board; reports matched pairs to the host as the player progresses. Re-key it to reset. */
export function MatchBoard({ tiles, onProgress, onSound }: { tiles: MatchTile[]; onProgress: (matched: number, done: boolean) => void; onSound?: (cue: 'correct' | 'wrong') => void }) {
  const { t } = useTranslation('live')
  const [picked, setPicked] = useState<number | null>(null)
  const [gone, setGone] = useState<Set<number>>(new Set())
  const [shake, setShake] = useState<number[]>([])
  const total = tiles.length / 2

  const tap = (id: number) => {
    if (gone.has(id) || shake.length) return
    if (picked === null) {
      setPicked(id)
      return
    }
    if (picked === id) {
      setPicked(null)
      return
    }
    const a = tiles[picked]
    const b = tiles[id]
    if (a.pairId === b.pairId && a.side !== b.side) {
      const next = new Set(gone)
      next.add(picked)
      next.add(id)
      setGone(next)
      setPicked(null)
      onSound?.('correct')
      const matched = next.size / 2
      onProgress(matched, matched >= total)
    } else {
      setShake([picked, id])
      onSound?.('wrong')
      setTimeout(() => {
        setShake([])
        setPicked(null)
      }, 350)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{t('play.matchHint')}</span>
        <span className="font-semibold tabular-nums">{t('host.pairs', { matched: gone.size / 2, total })}</span>
      </div>
      <div className={cn('grid flex-1 gap-2', tiles.length > 12 ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4')}>
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => tap(tile.id)}
            disabled={gone.has(tile.id)}
            className={cn(
              'card flex min-h-20 items-center justify-center p-2 text-center text-sm font-semibold break-words transition sm:text-base',
              gone.has(tile.id) && 'invisible',
              picked === tile.id && 'ring-2 ring-primary bg-primary-soft',
              shake.includes(tile.id) && 'animate-shake ring-2 ring-error',
              tile.side === 'definition' && 'text-muted',
            )}
          >
            {tile.text}
          </button>
        ))}
      </div>
    </div>
  )
}
