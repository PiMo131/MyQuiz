import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { formatCode } from '@/domain/live/protocol'
import { cn } from '@/ui'

export function CodeBadge({ code, hidden, onToggle, size = 'lg' }: { code: string; hidden: boolean; onToggle: () => void; size?: 'md' | 'lg' }) {
  const { t } = useTranslation('live')
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn('font-mono font-black tracking-[0.2em] tabular-nums', size === 'lg' ? 'text-4xl sm:text-6xl lg:text-7xl' : 'text-2xl')}
        aria-label={t('host.code')}
      >
        {hidden ? '•••-•••' : formatCode(code)}
      </span>
      <button
        onClick={onToggle}
        className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-muted hover:text-text"
        aria-label={hidden ? t('host.showCode') : t('host.hideCode')}
      >
        {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
