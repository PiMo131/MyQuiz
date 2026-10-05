import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Trophy } from 'lucide-react'
import { cn } from '@/ui'

/** Full-screen page frame used by every game. */
export function GameLayout({ header, children, className }: { header: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-dvh flex-col bg-bg text-text', className)}>
      {header}
      <main className="relative flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}

/** Score (left) and best score with trophy (right); optional centre chip (moves, level…). */
export function Hud({ score, best, center, className }: { score: ReactNode; best?: ReactNode; center?: ReactNode; className?: string }) {
  const { t } = useTranslation('common')
  return (
    <div className={cn('mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2 text-lg font-bold tabular-nums', className)}>
      <div aria-label={t('common.score')}>{score}</div>
      {center !== undefined && <div className="rounded-full bg-surface-2 px-4 py-1 text-base">{center}</div>}
      <div className="flex items-center gap-1.5 text-highlight" aria-label={t('common.best')} title={t('common.best')}>
        <Trophy size={18} /> {best ?? '–'}
      </div>
    </div>
  )
}

/** Overlay shown while the tab is hidden / game is paused. */
export function PausedOverlay({ label, onResume }: { label: string; onResume?: () => void }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-bg/80 backdrop-blur-sm" role="status">
      <button onClick={onResume} className="card px-8 py-5 text-lg font-bold">
        {label}
      </button>
    </div>
  )
}

/** Loading / not-found states shared by all game pages. Returns null when the page can render. */
export function GameStatus({ loading, found }: { loading: boolean; found: boolean }) {
  const { t } = useTranslation('games')
  if (loading) return <div className="flex flex-1 items-center justify-center text-muted">{t('common.loadingSet')}</div>
  if (!found) return <div className="flex flex-1 items-center justify-center text-muted">{t('common.setNotFound')}</div>
  return null
}
