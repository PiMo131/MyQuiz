import { Suspense, lazy, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { Hammer } from 'lucide-react'

type ModuleLoader = () => Promise<Record<string, unknown>>

/**
 * Panels owned by other features. Resolved through import.meta.glob so that a missing module
 * (feature not merged yet) degrades to a placeholder instead of breaking typecheck/build.
 */
const SHARE = import.meta.glob<Record<string, unknown>>('/src/features/share/index.ts')
const AI = import.meta.glob<Record<string, unknown>>('/src/features/ai/index.ts')
const TTS = import.meta.glob<Record<string, unknown>>('/src/features/tts/index.ts')

function MissingPanel({ name }: { name: string }) {
  const { t } = useTranslation('library')
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
      <Hammer size={16} />
      {t('settings.panelMissing', { name })}
    </div>
  )
}

function makeExternal(mods: Record<string, ModuleLoader>, exportName: string): ComponentType {
  const loader = Object.values(mods)[0]
  if (!loader) return () => <MissingPanel name={exportName} />
  const Lazy = lazy(async () => {
    const m = await loader()
    const C = m[exportName] as ComponentType | undefined
    return { default: C ?? (() => <MissingPanel name={exportName} />) }
  })
  return () => (
    <Suspense fallback={<div className="h-16 animate-pulse rounded-xl bg-surface-2" />}>
      <Lazy />
    </Suspense>
  )
}

export const BackupPanel = makeExternal(SHARE, 'BackupPanel')
export const AiSettingsPanel = makeExternal(AI, 'AiSettingsPanel')
export const TtsSettingsPanel = makeExternal(TTS, 'TtsSettingsPanel')
export const externalAvailable = { share: Object.keys(SHARE).length > 0, ai: Object.keys(AI).length > 0, tts: Object.keys(TTS).length > 0 }
