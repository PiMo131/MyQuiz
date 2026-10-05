import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2, Volume2, VolumeX, X } from 'lucide-react'
import { cn } from '@/ui'

export interface LiveHeaderProps {
  left?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  soundOn?: boolean
  onToggleSound?: () => void
  onOptions?: () => void
  onClose: () => void
  right?: ReactNode
  className?: string
}

/** Full-screen header shared by host and player screens. */
export function LiveHeader({ left, title, subtitle, soundOn, onToggleSound, onOptions, onClose, right, className }: LiveHeaderProps) {
  const { t } = useTranslation()
  const btn = 'grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text'
  return (
    <header className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-surface/80 px-3 py-2 backdrop-blur sm:px-5', className)}>
      <div className="flex min-w-0 items-center gap-2">{left}</div>
      <div className="min-w-0 text-center">
        <div className="truncate text-sm font-semibold sm:text-base">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
      </div>
      <div className="flex items-center justify-end gap-1">
        {right}
        {onToggleSound && (
          <button className={btn} onClick={onToggleSound} aria-label={t('common.sound')} aria-pressed={soundOn}>
            {soundOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        )}
        {onOptions && (
          <button className={btn} onClick={onOptions} aria-label={t('common.options')}>
            <Settings2 size={20} />
          </button>
        )}
        <button className={btn} onClick={onClose} aria-label={t('common.close')}>
          <X size={22} />
        </button>
      </div>
    </header>
  )
}
