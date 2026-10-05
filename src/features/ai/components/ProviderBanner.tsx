import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Cpu, Chrome, KeyRound, Zap, Download } from 'lucide-react'
import { Button, ProgressBar } from '@/ui'
import { useAiStatus } from '../useAiStatus'

/** Banner on the AI hub: which provider is active + the quickest upgrade path. */
export function ProviderBanner() {
  const { t } = useTranslation('ai')
  const s = useAiStatus()
  const Icon = s.provider === 'byok' ? KeyRound : s.provider === 'webllm' ? Cpu : s.provider === 'chrome-nano' ? Chrome : Zap
  const loading = s.webllm.state === 'loading'
  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-indigo text-white">
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{t('banner.active', { provider: s.label })}</div>
        <p className="text-sm text-muted">{t(`banner.desc.${s.provider}`)}</p>
        {loading && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <Download size={14} className="animate-bounce" />
            <ProgressBar value={Math.round(s.webllm.progress * 100)} className="flex-1" />
            <span>{Math.round(s.webllm.progress * 100)}%</span>
          </div>
        )}
        {s.lastError && <p className="mt-1 text-xs text-error">{s.lastError}</p>}
      </div>
      <Link to="/settings#ai">
        <Button variant={s.llm ? 'outline' : 'primary'} size="sm">
          {s.llm ? t('banner.manage') : t('banner.upgrade')}
        </Button>
      </Link>
    </div>
  )
}
