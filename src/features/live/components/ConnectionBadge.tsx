import { useTranslation } from 'react-i18next'
import { Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/ui'

export function ConnectionBadge({ state, peers }: { state: 'connected' | 'connecting' | 'offline'; peers?: number }) {
  const { t } = useTranslation('live')
  const tone = state === 'connected' ? 'text-accent' : state === 'connecting' ? 'text-highlight' : 'text-error'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold', tone)} role="status">
      {state === 'offline' ? <WifiOff size={14} /> : <Wifi size={14} className={state === 'connecting' ? 'animate-pulse' : ''} />}
      <span>{t(`status.${state}`)}</span>
      {peers !== undefined && peers > 0 && <span className="text-muted">· {t('status.peers', { count: peers })}</span>}
    </span>
  )
}
