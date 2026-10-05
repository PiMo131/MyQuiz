import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  Download,
  Globe,
  KeyRound,
  Cpu,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import type { AiProviderKind, AiSettings, ByokVendor } from '@/domain/types'
import { useSettings } from '@/app/settings-store'
import { Button, Input, Label, ProgressBar, Select, Toggle } from '@/ui'
import { VENDORS, byokConfigured, testByok, vendorInfo } from '../providers/byok'
import { chromeNanoAvailability, chromeNanoDownload, hasChromeNanoApi } from '../providers/chromeNano'
import {
  WEBLLM_MODELS,
  chooseDefaultModel,
  hasWebGpu,
  isModelCached,
  loadWebllm,
  removeModelFromCache,
  unloadWebllm,
} from '../providers/webllm'
import { useAiStatus } from '../useAiStatus'
import { ProviderChip } from './ProviderChip'

const PROVIDERS: AiProviderKind[] = ['auto', 'heuristics', 'chrome-nano', 'webllm', 'byok']

export function AiSettingsPanel() {
  const { t } = useTranslation('ai')
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const ai = settings.ai
  const status = useAiStatus()
  const patch = (p: Partial<AiSettings>) => update({ ai: { ...ai, ...p } })

  // --- WebLLM ---
  const model = ai.webllmModel ?? chooseDefaultModel()
  const modelInfo = WEBLLM_MODELS.find((m) => m.id === model)
  const [cached, setCached] = useState<boolean | null>(hasWebGpu() ? null : false)
  useEffect(() => {
    let alive = true
    if (hasWebGpu()) void isModelCached(model).then((c) => alive && setCached(c))
    return () => {
      alive = false
    }
  }, [model, status.webllm.state])
  const webllmBusy = status.webllm.state === 'loading'

  // --- Chrome Nano ---
  const [nanoProgress, setNanoProgress] = useState<number | null>(null)
  useEffect(() => {
    if (hasChromeNanoApi()) void chromeNanoAvailability()
  }, [])

  // --- BYOK ---
  const byok = ai.byok ?? { vendor: 'gemini' as ByokVendor, apiKey: '' }
  const info = vendorInfo(byok.vendor)
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'fail'; msg?: string }>({
    state: 'idle',
  })
  const runTest = async () => {
    setTest({ state: 'busy' })
    const r = await testByok(ai)
    setTest(r.ok ? { state: 'ok', msg: r.sample } : { state: 'fail', msg: r.error })
  }

  return (
    <div className="space-y-6" id="ai">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{t('settings.intro')}</p>
        <span className="inline-flex items-center gap-2 text-sm">
          {t('settings.activeNow')} <ProviderChip link={false} />
        </span>
      </div>

      <div>
        <Label htmlFor="ai-provider">{t('settings.provider')}</Label>
        <Select
          id="ai-provider"
          value={ai.provider}
          onChange={(e) => void patch({ provider: e.target.value as AiProviderKind })}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {t(`settings.providers.${p}`)}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-muted">{t(`settings.providerHint.${ai.provider}`)}</p>
      </div>

      {/* Chrome built-in AI */}
      <section className="card space-y-3 p-4">
        <div className="flex items-center gap-2 font-semibold">
          <Globe size={18} className="text-primary" /> {t('settings.nano.title')}
        </div>
        <p className="text-sm text-muted">{t('settings.nano.desc')}</p>
        {!hasChromeNanoApi() ? (
          <p className="text-sm text-muted">{t('settings.nano.unavailable')}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5">
              {status.chromeNano === 'available' ? (
                <CheckCircle2 size={16} className="text-accent" />
              ) : (
                <TriangleAlert size={16} className="text-highlight" />
              )}
              {t(`settings.nano.state.${status.chromeNano}`)}
            </span>
            {(status.chromeNano === 'downloadable' || status.chromeNano === 'downloading') && (
              <Button
                size="sm"
                variant="outline"
                loading={nanoProgress !== null && nanoProgress < 1}
                onClick={() => void chromeNanoDownload(setNanoProgress).finally(() => setNanoProgress(null))}
                leftIcon={<Download size={14} />}
              >
                {nanoProgress !== null ? `${Math.round(nanoProgress * 100)}%` : t('settings.nano.download')}
              </Button>
            )}
          </div>
        )}
      </section>

      {/* WebLLM */}
      <section className="card space-y-3 p-4">
        <div className="flex items-center gap-2 font-semibold">
          <Cpu size={18} className="text-primary" /> {t('settings.webllm.title')}
        </div>
        <p className="text-sm text-muted">{t('settings.webllm.desc')}</p>
        {!hasWebGpu() && (
          <p className="rounded-lg bg-highlight-soft px-3 py-2 text-xs text-highlight">
            {t('settings.webllm.noWebgpu')}
          </p>
        )}
        <Toggle
          checked={!!ai.webllmConsent}
          disabled={!hasWebGpu()}
          onChange={(v) => void patch({ webllmConsent: v })}
          label={t('settings.webllm.consent')}
          description={t('settings.webllm.consentHint', { size: modelInfo?.sizeMb ?? 600 })}
        />
        <div>
          <Label htmlFor="webllm-model">{t('settings.webllm.model')}</Label>
          <Select
            id="webllm-model"
            value={model}
            disabled={!ai.webllmConsent || webllmBusy}
            onChange={(e) => void patch({ webllmModel: e.target.value })}
          >
            {WEBLLM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · ≈{m.sizeMb} MB
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted">
            {status.webllm.state === 'ready' ? <CheckCircle2 size={16} className="text-accent" /> : null}
            {t(`settings.webllm.state.${status.webllm.state}`)}
            {cached && status.webllm.state !== 'ready' ? ` · ${t('settings.webllm.cached')}` : ''}
          </span>
          <div className="ml-auto flex gap-2">
            {status.webllm.state === 'ready' ? (
              <Button size="sm" variant="outline" onClick={() => void unloadWebllm()}>
                {t('settings.webllm.unload')}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!ai.webllmConsent || !hasWebGpu()}
                loading={webllmBusy}
                onClick={() => void loadWebllm(model).catch(() => undefined)}
                leftIcon={<Download size={14} />}
              >
                {cached ? t('settings.webllm.load') : t('settings.webllm.download')}
              </Button>
            )}
            {cached && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void removeModelFromCache(model)}
                leftIcon={<Trash2 size={14} />}
                aria-label={t('settings.webllm.remove')}
              >
                {t('settings.webllm.remove')}
              </Button>
            )}
          </div>
        </div>
        {webllmBusy && (
          <div className="space-y-1">
            <ProgressBar value={Math.round(status.webllm.progress * 100)} />
            <p className="truncate text-xs text-muted">{status.webllm.text}</p>
          </div>
        )}
        {status.webllm.state === 'error' && <p className="text-xs text-error">{status.webllm.error}</p>}
      </section>

      {/* BYOK */}
      <section className="card space-y-3 p-4">
        <div className="flex items-center gap-2 font-semibold">
          <KeyRound size={18} className="text-primary" /> {t('settings.byok.title')}
        </div>
        <p className="text-sm text-muted">{t('settings.byok.desc')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="byok-vendor">{t('settings.byok.vendor')}</Label>
            <Select
              id="byok-vendor"
              value={byok.vendor}
              onChange={(e) =>
                void patch({ byok: { ...byok, vendor: e.target.value as ByokVendor, model: '' } })
              }
            >
              {VENDORS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="byok-model">{t('settings.byok.model')}</Label>
            <Input
              id="byok-model"
              value={byok.model ?? ''}
              placeholder={info.defaultModel || 'model-id'}
              onChange={(e) => void patch({ byok: { ...byok, model: e.target.value } })}
            />
          </div>
          <div className={byok.vendor === 'custom' ? '' : 'sm:col-span-2'}>
            <Label htmlFor="byok-key">{t('settings.byok.key')}</Label>
            <Input
              id="byok-key"
              type="password"
              autoComplete="off"
              value={byok.apiKey}
              placeholder="sk-…"
              onChange={(e) => void patch({ byok: { ...byok, apiKey: e.target.value } })}
            />
            {info.keyUrl && (
              <a
                href={info.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-primary underline"
              >
                {t('settings.byok.getKey', { vendor: info.label })}
              </a>
            )}
          </div>
          {byok.vendor === 'custom' && (
            <div>
              <Label htmlFor="byok-base">{t('settings.byok.baseUrl')}</Label>
              <Input
                id="byok-base"
                type="url"
                value={byok.baseUrl ?? ''}
                placeholder="https://host/v1"
                onChange={(e) => void patch({ byok: { ...byok, baseUrl: e.target.value } })}
              />
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="ai-proxy">{t('settings.proxy.title')}</Label>
          <Input
            id="ai-proxy"
            type="url"
            value={ai.proxyUrl ?? ''}
            placeholder="https://myquizz-ai-proxy.example.workers.dev"
            onChange={(e) => void patch({ proxyUrl: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted">{t('settings.proxy.hint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={!byokConfigured(ai)}
            loading={test.state === 'busy'}
            onClick={() => void runTest()}
          >
            {t('settings.byok.test')}
          </Button>
          {test.state === 'ok' && (
            <span className="inline-flex items-center gap-1 text-sm text-accent">
              <CheckCircle2 size={16} /> {t('settings.byok.testOk', { sample: test.msg })}
            </span>
          )}
          {test.state === 'fail' && (
            <span className="inline-flex items-center gap-1 text-sm text-error">
              <TriangleAlert size={16} /> {t('settings.byok.testFail', { error: test.msg })}
            </span>
          )}
          {(byok.apiKey || ai.proxyUrl) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void patch({ byok: null, proxyUrl: '' })}
              leftIcon={<Trash2 size={14} />}
            >
              {t('settings.byok.clear')}
            </Button>
          )}
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>{t('settings.privacy')}</span>
      </div>
      <div className="flex items-start gap-2 text-xs text-muted">
        <Zap size={14} className="mt-0.5 shrink-0" />
        <span>{t('settings.heuristicsNote')}</span>
      </div>
    </div>
  )
}
