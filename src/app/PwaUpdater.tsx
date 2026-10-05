import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/ui'

export function PwaUpdater() {
  const { t } = useTranslation()
  const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true })
  useEffect(() => {
    if (needRefresh[0]) {
      toast.info(t('common.updateAvailable'), { timeout: 0, action: { label: t('common.reload'), onClick: () => void updateServiceWorker(true) } })
    }
  }, [needRefresh, t, updateServiceWorker])
  useEffect(() => {
    const on = () => toast.info(t('common.offline'))
    window.addEventListener('offline', on)
    return () => window.removeEventListener('offline', on)
  }, [t])
  return null
}
