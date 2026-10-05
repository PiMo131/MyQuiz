import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Cpu, Globe, KeyRound, Sparkles, Zap } from 'lucide-react'
import { Badge, cn } from '@/ui'
import type { ActiveProviderKind } from '../providers/types'
import { useAiStatus } from '../useAiStatus'

const ICONS: Record<ActiveProviderKind, typeof Cpu> = {
  heuristics: Zap,
  'chrome-nano': Globe,
  webllm: Cpu,
  byok: KeyRound,
}

/** Small chip showing which provider answers: Basic / Globe AI / Local model / Your key. */
export function ProviderChip({
  provider,
  className,
  link = true,
}: {
  provider?: ActiveProviderKind
  className?: string
  link?: boolean
}) {
  const { t } = useTranslation('ai')
  const status = useAiStatus()
  const kind = provider ?? status.provider
  const Icon = ICONS[kind]
  const tone = kind === 'heuristics' ? 'neutral' : kind === 'byok' ? 'highlight' : 'primary'
  const chip = (
    <Badge tone={tone} className={cn('gap-1.5', className)} title={t('provider.chipTitle')}>
      <Icon size={12} />
      {t(`provider.${kind}`)}
      {status.busy && kind !== 'heuristics' && (
        <span className="ml-0.5 h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
      )}
    </Badge>
  )
  return link ? (
    <Link to="/settings#ai" aria-label={t('provider.chipTitle')}>
      {chip}
    </Link>
  ) : (
    chip
  )
}

/** Footer used on every AI screen: disclaimer + provider chip + "Enhanced with AI" style label. */
export function AiFooter({ provider, className }: { provider?: ActiveProviderKind; className?: string }) {
  const { t } = useTranslation('ai')
  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-t border-border pt-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <span>{t('footer.disclaimer')}</span>
      <span className="inline-flex items-center gap-2">
        <Sparkles size={12} className="text-primary" />
        {t('footer.enhanced')}
        <ProviderChip provider={provider} />
      </span>
    </div>
  )
}

/** Hint shown when heuristics are used: how to get better results. */
export function BetterResultsHint({ className }: { className?: string }) {
  const { t } = useTranslation('ai')
  const status = useAiStatus()
  if (status.llm) return null
  return (
    <p className={cn('rounded-xl bg-primary-soft px-3 py-2 text-xs text-primary', className)}>
      {t('provider.betterResults')}{' '}
      <Link to="/settings#ai" className="font-semibold underline">
        {t('provider.openSettings')}
      </Link>
    </p>
  )
}
