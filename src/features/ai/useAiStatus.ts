import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '@/app/settings-store'
import { useAiStatusStore } from './providers/status'
import { resolveProvider } from './providers/router'
import type { ActiveProviderKind } from './providers/types'

export function providerLabelKey(kind: ActiveProviderKind): string {
  return `provider.${kind}`
}

/** Current AI provider status for UI chips/banners. Re-resolves when AI settings change. */
export function useAiStatus() {
  const { t } = useTranslation('ai')
  const ai = useSettings((s) => s.settings.ai)
  const active = useAiStatusStore((s) => s.active)
  const resolved = useAiStatusStore((s) => s.resolved)
  const webllm = useAiStatusStore((s) => s.webllm)
  const chromeNano = useAiStatusStore((s) => s.chromeNano)
  const webgpu = useAiStatusStore((s) => s.webgpu)
  const busy = useAiStatusStore((s) => s.busy)
  const lastError = useAiStatusStore((s) => s.lastError)
  useEffect(() => {
    void resolveProvider(ai)
  }, [ai, webllm.state])
  return useMemo(
    () => ({
      provider: active,
      label: t(providerLabelKey(active)),
      /** true when an LLM (not heuristics) will answer */
      llm: active !== 'heuristics',
      ready: resolved,
      busy: busy > 0,
      webllm,
      chromeNano,
      webgpu,
      lastError,
      refresh: () => resolveProvider(ai),
    }),
    [active, resolved, busy, webllm, chromeNano, webgpu, lastError, t, ai],
  )
}
