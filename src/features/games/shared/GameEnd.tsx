import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Trophy } from 'lucide-react'
import { Button } from '@/ui'
import { fireConfetti } from './confetti'
import { useSfx } from './sound'

export interface GameEndProps {
  setId: string
  title?: string
  scoreLabel: string
  score: ReactNode
  bestLabel?: string
  best?: ReactNode
  isNewBest: boolean
  onPlayAgain: () => void
  children?: ReactNode
  /** play the lose sound instead of win */
  lost?: boolean
}

export function GameEnd({ setId, title, scoreLabel, score, bestLabel, best, isNewBest, onPlayAgain, children, lost }: GameEndProps) {
  const { t } = useTranslation(['games', 'common'])
  const play = useSfx()
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    if (isNewBest) fireConfetti()
    play(lost && !isNewBest ? 'lose' : 'win')
  }, [isNewBest, lost, play])
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{title ?? (isNewBest ? t('games:common.newBest') : t('games:common.gameOver'))}</h1>
      {isNewBest && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-highlight-soft px-3 py-1 text-sm font-semibold text-highlight">
          <Trophy size={16} /> {t('games:common.newBestBadge')}
        </div>
      )}
      <div className="mt-6 grid w-full max-w-sm grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{scoreLabel}</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums">{score}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{bestLabel ?? t('common:common.best')}</div>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-3xl font-extrabold tabular-nums text-highlight">
            <Trophy size={22} /> {best ?? '–'}
          </div>
        </div>
      </div>
      {children && <div className="mt-6 w-full max-w-lg">{children}</div>}
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Button size="lg" full onClick={onPlayAgain} autoFocus>
          {t('games:common.playAgain')}
        </Button>
        <Link to={`/set/${setId}`}>
          <Button variant="outline" full>
            {t('games:common.backToSet')}
          </Button>
        </Link>
      </div>
    </div>
  )
}
