/** TTS React components. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2, Square } from 'lucide-react'
import { useSettings } from '@/app/settings-store'
import { Button, Label, Select, Toggle, cn } from '@/ui'
import { pickVoice, speak, stop, useTtsStore, voicesFor } from './engine'
import { useTts } from './useTts'

export function TtsButton({
  text,
  lang,
  size = 'md',
  className,
  label,
}: {
  text: string
  lang?: string
  size?: 'sm' | 'md'
  className?: string
  label?: string
}) {
  const { t } = useTranslation('ai')
  const { speaking, supported, enabled } = useTts()
  const current = useTtsStore((s) => s.current)
  const [mine, setMine] = useState<number | null>(null)
  if (!supported || !enabled) return null
  const active = speaking && mine === current
  const px = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  return (
    <button
      type="button"
      aria-label={label ?? t('tts.readAloud')}
      aria-pressed={active}
      className={cn(
        'inline-grid place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text',
        active && 'text-primary',
        px,
        className,
      )}
      onClick={(e) => {
        e.stopPropagation()
        if (active) {
          stop()
          setMine(null)
        } else {
          void speak(text, lang)
          setMine(useTtsStore.getState().current)
        }
      }}
    >
      {active ? <Square size={size === 'sm' ? 13 : 16} /> : <Volume2 size={size === 'sm' ? 15 : 18} />}
    </button>
  )
}

const LANGS = ['nl', 'en', 'de', 'fr', 'es']

export function TtsSettingsPanel() {
  const { t } = useTranslation('ai')
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const { voices, supported } = useTts()
  const tts = settings.tts
  const setVoice = (lang: string, name: string) => {
    const voiceByLang = { ...tts.voiceByLang }
    if (name) voiceByLang[lang] = name
    else delete voiceByLang[lang]
    void update({ tts: { ...tts, voiceByLang } })
  }
  if (!supported) return <p className="text-sm text-muted">{t('tts.unsupported')}</p>
  const sample: Record<string, string> = {
    nl: 'Dit is een voorbeeld van de voorleesstem.',
    en: 'This is a sample of the reading voice.',
    de: 'Dies ist ein Beispiel der Vorlesestimme.',
    fr: 'Ceci est un exemple de la voix de lecture.',
    es: 'Este es un ejemplo de la voz de lectura.',
  }
  return (
    <div className="space-y-4">
      <Toggle
        checked={tts.enabled}
        onChange={(v) => void update({ tts: { ...tts, enabled: v } })}
        label={t('tts.enable')}
        description={t('tts.enableHint')}
      />
      <div>
        <Label htmlFor="tts-rate">{t('tts.rate', { value: tts.rate.toFixed(1) })}</Label>
        <input
          id="tts-rate"
          type="range"
          min={0.5}
          max={1.8}
          step={0.1}
          value={tts.rate}
          onChange={(e) => void update({ tts: { ...tts, rate: Number(e.target.value) } })}
          className="w-full accent-primary"
          disabled={!tts.enabled}
        />
      </div>
      <div className="space-y-3">
        {LANGS.map((lang) => {
          const list = voicesFor(lang, voices)
          const current = tts.voiceByLang[lang] ?? ''
          return (
            <div key={lang} className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
              <div className="flex-1">
                <Label htmlFor={`voice-${lang}`}>{t(`tts.voiceFor.${lang}`)}</Label>
                <Select
                  id={`voice-${lang}`}
                  value={current}
                  onChange={(e) => setVoice(lang, e.target.value)}
                  disabled={!tts.enabled}
                >
                  <option value="">
                    {t('tts.autoVoice', { name: pickVoice(lang, voices)?.name ?? '—' })}
                  </option>
                  {list.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang}){v.localService ? '' : ' ☁'}
                    </option>
                  ))}
                </Select>
                {list.length === 0 && <p className="mt-1 text-xs text-muted">{t('tts.noVoices')}</p>}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!tts.enabled}
                onClick={() => void speak(sample[lang], lang)}
                leftIcon={<Volume2 size={14} />}
              >
                {t('tts.test')}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
