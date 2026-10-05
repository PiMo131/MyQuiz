import { useTranslation } from 'react-i18next'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Button, cn } from '@/ui'
import { useInstallPrompt } from './useInstallPrompt'

/** Card inviting the user to install MyQuizz; iOS gets the Share → Add to Home Screen hint. */
export function InstallBanner({ className }: { className?: string }) {
  const { t } = useTranslation('library')
  const { visible, canInstall, iosHint, install, dismiss } = useInstallPrompt()
  if (!visible) return null
  return (
    <section className={cn('card relative overflow-hidden p-5', className)} aria-label={t('pwa.installTitle')}>
      <div className="absolute inset-y-0 right-0 w-40 bg-gradient-indigo opacity-10" aria-hidden />
      <button onClick={dismiss} aria-label={t('pwa.dismiss')} className="absolute right-3 top-3 rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-text">
        <X size={16} />
      </button>
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-indigo text-white shadow-sm">
          <Download size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">{t('pwa.installTitle')}</h3>
          <p className="mt-0.5 text-sm text-muted">{t('pwa.installBody')}</p>
          {iosHint && (
            <ol className="mt-3 space-y-1.5 text-sm">
              <li className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">1</span>{t('pwa.iosStep1')} <Share size={15} className="text-primary" /></li>
              <li className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">2</span>{t('pwa.iosStep2')} <SquarePlus size={15} className="text-primary" /></li>
            </ol>
          )}
          {canInstall && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void install()} leftIcon={<Download size={15} />}>{t('pwa.install')}</Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>{t('pwa.later')}</Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
