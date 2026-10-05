import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Moon, Sparkles, Sun, SunMoon } from 'lucide-react'
import { useSettings } from '@/app/settings-store'
import type { Settings } from '@/domain/types'
import { Button, Input, Label, cn } from '@/ui'

export const AVATARS = ['🦊', '🐼', '🦉', '🐸', '🦄', '🐙', '🐯', '🐧', '🦋', '🐝', '🌵', '🚀', '🎸', '🍕', '⚡', '🌈']

export function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation('library')
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('settings.avatar')}>
      {AVATARS.map((a) => (
        <button key={a} type="button" role="radio" aria-checked={value === a} aria-label={a} onClick={() => onChange(a)} className={cn('grid h-10 w-10 place-items-center rounded-xl text-xl transition hover:bg-surface-2', value === a && 'bg-primary-soft ring-2 ring-primary')}>
          {a}
        </button>
      ))}
    </div>
  )
}

export function ThemeChoice({ value, onChange }: { value: Settings['theme']; onChange: (v: Settings['theme']) => void }) {
  const { t } = useTranslation('library')
  const opts: Array<{ v: Settings['theme']; icon: React.ReactNode }> = [
    { v: 'system', icon: <SunMoon size={16} /> },
    { v: 'light', icon: <Sun size={16} /> },
    { v: 'dark', icon: <Moon size={16} /> },
  ]
  return (
    <div className="inline-flex rounded-full border border-border bg-surface p-1" role="radiogroup" aria-label={t('settings.theme')}>
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition', value === o.v ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text')}>
          {o.icon}
          {t(`settings.themes.${o.v}`)}
        </button>
      ))}
    </div>
  )
}

export function LangChoice({ value, onChange }: { value: Settings['locale']; onChange: (v: Settings['locale']) => void }) {
  const { t } = useTranslation('library')
  return (
    <div className="inline-flex rounded-full border border-border bg-surface p-1" role="radiogroup" aria-label={t('settings.language')}>
      {(['nl', 'en'] as const).map((l) => (
        <button key={l} type="button" role="radio" aria-checked={value === l} onClick={() => onChange(l)} className={cn('rounded-full px-3 py-1.5 text-sm font-medium transition', value === l ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text')}>
          {l === 'nl' ? 'Nederlands' : 'English'}
        </button>
      ))}
    </div>
  )
}

/** First-visit card: name, avatar, language, theme → settings.onboarded = true. */
export function OnboardingCard() {
  const { t } = useTranslation('library')
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [name, setName] = useState(settings.displayName)
  const [avatar, setAvatar] = useState(settings.avatar || AVATARS[0])
  const [busy, setBusy] = useState(false)
  const finish = async () => {
    setBusy(true)
    try {
      await update({ displayName: name.trim(), avatar, onboarded: true })
    } finally { setBusy(false) }
  }
  return (
    <section className="card relative overflow-hidden p-6" aria-label={t('onboarding.title')}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-indigo opacity-15 blur-2xl" aria-hidden />
      <div className="flex items-center gap-2 text-primary"><Sparkles size={18} /><span className="text-xs font-bold uppercase tracking-wider">{t('onboarding.kicker')}</span></div>
      <h2 className="mt-2 text-2xl font-bold">{t('onboarding.title')}</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">{t('onboarding.body')}</p>
      <form className="mt-5 grid gap-5 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void finish() }}>
        <div>
          <Label htmlFor="onb-name">{t('settings.displayName')}</Label>
          <Input id="onb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.displayNamePlaceholder')} maxLength={40} autoFocus />
          <div className="mt-4">
            <Label>{t('settings.avatar')}</Label>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <Label>{t('settings.language')}</Label>
            <LangChoice value={settings.locale} onChange={(l) => void update({ locale: l })} />
          </div>
          <div>
            <Label>{t('settings.theme')}</Label>
            <ThemeChoice value={settings.theme} onChange={(th) => void update({ theme: th })} />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-2xl">{avatar}</span>
            <div className="text-sm">
              <div className="font-semibold">{name.trim() || t('onboarding.anonymous')}</div>
              <div className="text-muted">{t('onboarding.preview')}</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" loading={busy} size="lg">{t('onboarding.start')}</Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => void update({ onboarded: true })}>{t('onboarding.skip')}</Button>
        </div>
      </form>
    </section>
  )
}
