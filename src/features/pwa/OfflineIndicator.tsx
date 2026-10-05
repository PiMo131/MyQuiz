import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'
import { useOnline } from './useOnline'

/** Small pill shown while the browser reports no connectivity. */
export function OfflineIndicator() {
  const { t } = useTranslation()
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-highlight/40 bg-highlight-soft px-3.5 py-2 text-sm text-text">
      <WifiOff size={16} className="text-highlight" />
      {t('common.offline')}
    </div>
  )
}
