import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Settings, Volume2, VolumeX, X } from 'lucide-react'
import type { StudyMode } from '@/domain/types'
import { cn } from '@/ui'
import { ModeSwitcher } from './ModeSwitcher'

export interface StudyHeaderProps {
  mode: StudyMode
  setId: string
  title: string
  /** e.g. "3 / 12" */
  counter?: ReactNode
  /** Extra controls rendered before the sound/settings/close buttons. */
  right?: ReactNode
  sound?: boolean
  onToggleSound?: () => void
  onSettings?: () => void
  onClose?: () => void
  className?: string
}

/**
 * Full-screen study/game header: mode switcher left, counter + title centre, sound/settings/close right.
 * Shared with the games feature via `@/features/study`.
 */
export function StudyHeader({ mode, setId, title, counter, right, sound, onToggleSound, onSettings, onClose, className }: StudyHeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const close = onClose ?? (() => navigate(`/set/${setId}`))
  return (
    <header className={cn('sticky top-0 z-30 grid h-16 grid-cols-[auto_1fr_auto] items-center gap-2 bg-bg/90 px-3 backdrop-blur sm:px-5', className)}>
      <ModeSwitcher mode={mode} setId={setId} />
      <div className="min-w-0 text-center">
        {counter !== undefined && <div className="text-sm font-bold leading-tight">{counter}</div>}
        <div className="truncate text-xs text-muted sm:text-sm">{title}</div>
      </div>
      <div className="flex items-center gap-1">
        {right}
        {onToggleSound && (
          <button onClick={onToggleSound} aria-label={t('common.sound')} aria-pressed={sound} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text">
            {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        )}
        {onSettings && (
          <button onClick={onSettings} aria-label={t('common.options')} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text">
            <Settings size={20} />
          </button>
        )}
        <button onClick={close} aria-label={t('common.close')} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text">
          <X size={22} />
        </button>
      </div>
    </header>
  )
}
