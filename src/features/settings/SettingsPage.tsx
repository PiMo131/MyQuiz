import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Bot, Brain, Database, Github, HardDrive, Info, Palette, Shield, Trash2, User, Volume2, Mic } from 'lucide-react'
import { useSettings } from '@/app/settings-store'
import { requestPersistentStorage, storageEstimate } from '@/db/db'
import { wipeAll } from '@/db/repo'
import { APP_NAME, APP_VERSION, DEFAULT_GRADING, DEFAULT_SRS, type GradingStrictness, type Settings } from '@/domain/types'
import { Button, Input, Label, Modal, ProgressBar, Select, Toggle, cn, toast } from '@/ui'
import { AvatarPicker, LangChoice, ThemeChoice } from '@/features/home/OnboardingCard'
import { notificationPermission, requestNotificationPermission, showSystemNotification } from '@/features/notifications'
import { formatBytes } from '@/features/library'
import { AiSettingsPanel, BackupPanel, TtsSettingsPanel } from './external'

const SECTIONS = ['profile', 'appearance', 'study', 'sounds', 'tts', 'ai', 'notifications', 'data', 'about'] as const
type SectionId = (typeof SECTIONS)[number]
const ICONS: Record<SectionId, ReactNode> = {
  profile: <User size={16} />, appearance: <Palette size={16} />, study: <Brain size={16} />, sounds: <Volume2 size={16} />, tts: <Mic size={16} />,
  ai: <Bot size={16} />, notifications: <Bell size={16} />, data: <Database size={16} />, about: <Info size={16} />,
}

function Section({ id, title, description, children }: { id: SectionId; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 sm:p-6" aria-labelledby={`${id}-h`}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">{ICONS[id]}</span>
        <div>
          <h2 id={`${id}-h`} className="text-lg font-bold">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Row({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:w-1/2">
        <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="sm:w-1/2">{children}</div>
    </div>
  )
}

function NumberField({ id, value, min, max, step = 1, onChange, suffix }: { id: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Input id={id} type="number" inputMode="numeric" value={value} min={min} max={max} step={step} onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v))) }} className="w-28" />
      {suffix && <span className="text-sm text-muted">{suffix}</span>}
    </div>
  )
}

function StepsField({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => setText(value.join(', ')), [value])
  const commit = () => {
    const steps = text.split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^\d+(m|h|d)$/.test(s))
    onChange(steps)
    setText(steps.join(', '))
  }
  return <Input id={id} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} placeholder="1m, 10m" />
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation('library')
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [active, setActive] = useState<SectionId>('profile')
  const [name, setName] = useState(settings.displayName)
  useEffect(() => setName(settings.displayName), [settings.displayName])

  const srs = (patch: Partial<Settings['srs']>) => void update({ srs: { ...settings.srs, ...patch } })
  const grading = (patch: Partial<Settings['grading']>) => void update({ grading: { ...settings.grading, ...patch } })
  const notif = (patch: Partial<Settings['notifications']>) => void update({ notifications: { ...settings.notifications, ...patch } })

  // ----- storage
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    void storageEstimate().then(setEstimate)
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [])
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeText, setWipeText] = useState('')
  const wipeWord = t('settings.wipeWord')
  const [perm, setPerm] = useState(notificationPermission())

  const enableReminder = async (on: boolean) => {
    if (on) {
      const p = await requestNotificationPermission()
      setPerm(p)
      if (p !== 'granted') {
        toast.error(t('settings.notifDenied'))
        if (p === 'denied') return
      }
    }
    notif({ dailyReminder: on })
  }

  useEffect(() => {
    const els = SECTIONS.map((id) => document.getElementById(id)).filter((x): x is HTMLElement => !!x)
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActive(vis[0].target.id as SectionId)
      },
      { rootMargin: '-20% 0px -60% 0px' },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('settings.subtitle')}</p>
      <div className="mt-6 flex gap-8">
        <nav className="sticky top-24 hidden h-fit w-48 shrink-0 lg:block" aria-label={t('settings.title')}>
          <ul className="space-y-0.5">
            {SECTIONS.map((id) => (
              <li key={id}>
                <a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition', active === id ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-text')}>
                  {ICONS[id]}
                  {t(`settings.sections.${id}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1 space-y-6">
          <Section id="profile" title={t('settings.sections.profile')} description={t('settings.profileHint')}>
            <Row label={t('settings.displayName')} htmlFor="s-name">
              <Input id="s-name" value={name} maxLength={40} placeholder={t('settings.displayNamePlaceholder')} onChange={(e) => setName(e.target.value)} onBlur={() => name !== settings.displayName && void update({ displayName: name.trim() })} />
            </Row>
            <Row label={t('settings.avatar')}>
              <AvatarPicker value={settings.avatar} onChange={(a) => void update({ avatar: a })} />
            </Row>
          </Section>

          <Section id="appearance" title={t('settings.sections.appearance')}>
            <Row label={t('settings.language')}><LangChoice value={settings.locale} onChange={(l) => void update({ locale: l })} /></Row>
            <Row label={t('settings.theme')}><ThemeChoice value={settings.theme} onChange={(th) => void update({ theme: th })} /></Row>
          </Section>

          <Section id="study" title={t('settings.sections.study')} description={t('settings.studyHint')}>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{t('settings.srs')}</h3>
            <Row label={t('settings.retention')} hint={t('settings.retentionHint')} htmlFor="s-ret">
              <div className="flex items-center gap-3">
                <input id="s-ret" type="range" min={70} max={98} step={1} value={Math.round(settings.srs.requestRetention * 100)} onChange={(e) => srs({ requestRetention: Number(e.target.value) / 100 })} className="w-full accent-primary" />
                <span className="w-12 text-right text-sm font-semibold tabular-nums">{Math.round(settings.srs.requestRetention * 100)}%</span>
              </div>
            </Row>
            <Row label={t('settings.newPerDay')} htmlFor="s-new"><NumberField id="s-new" value={settings.srs.newPerDay} min={0} max={500} onChange={(v) => srs({ newPerDay: v })} /></Row>
            <Row label={t('settings.reviewsPerDay')} htmlFor="s-rev"><NumberField id="s-rev" value={settings.srs.reviewsPerDay} min={0} max={9999} onChange={(v) => srs({ reviewsPerDay: v })} /></Row>
            <Row label={t('settings.learningSteps')} hint={t('settings.stepsHint')} htmlFor="s-steps"><StepsField id="s-steps" value={settings.srs.learningSteps} onChange={(v) => srs({ learningSteps: v })} /></Row>
            <Row label={t('settings.relearningSteps')} htmlFor="s-resteps"><StepsField id="s-resteps" value={settings.srs.relearningSteps} onChange={(v) => srs({ relearningSteps: v })} /></Row>
            <Row label={t('settings.leechThreshold')} hint={t('settings.leechHint')} htmlFor="s-leech"><NumberField id="s-leech" value={settings.srs.leechThreshold} min={1} max={99} onChange={(v) => srs({ leechThreshold: v })} /></Row>
            <Row label={t('settings.leechAction')} htmlFor="s-leechact">
              <Select id="s-leechact" value={settings.srs.leechAction} onChange={(e) => srs({ leechAction: e.target.value as 'tag' | 'suspend' })}>
                <option value="tag">{t('settings.leechTag')}</option>
                <option value="suspend">{t('settings.leechSuspend')}</option>
              </Select>
            </Row>
            <Row label={t('settings.fuzz')} hint={t('settings.fuzzHint')}><Toggle checked={settings.srs.enableFuzz} onChange={(v) => srs({ enableFuzz: v })} /></Row>
            <div className="flex justify-end pt-2"><Button size="sm" variant="ghost" onClick={() => void update({ srs: DEFAULT_SRS })}>{t('settings.resetDefaults')}</Button></div>

            <h3 className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-muted">{t('settings.grading')}</h3>
            <Row label={t('settings.strictness')} htmlFor="s-strict">
              <Select id="s-strict" value={settings.grading.strictness} onChange={(e) => grading({ strictness: e.target.value as GradingStrictness })}>
                {(['relaxed', 'moderate', 'strict'] as const).map((s) => <option key={s} value={s}>{t(`settings.strictnessLevels.${s}`)}</option>)}
              </Select>
            </Row>
            <Row label={t('settings.caseSensitive')}><Toggle checked={!!settings.grading.caseSensitive} onChange={(v) => grading({ caseSensitive: v })} /></Row>
            <Row label={t('settings.ignoreAccents')}><Toggle checked={!!settings.grading.ignoreAccents} onChange={(v) => grading({ ignoreAccents: v })} /></Row>
            <Row label={t('settings.ignoreParentheses')} hint={t('settings.ignoreParenthesesHint')}><Toggle checked={!!settings.grading.ignoreParentheses} onChange={(v) => grading({ ignoreParentheses: v })} /></Row>
            <Row label={t('settings.acceptAlternatives')} hint={t('settings.acceptAlternativesHint')}><Toggle checked={!!settings.grading.acceptAlternatives} onChange={(v) => grading({ acceptAlternatives: v })} /></Row>
            <div className="flex justify-end pt-2"><Button size="sm" variant="ghost" onClick={() => void update({ grading: DEFAULT_GRADING })}>{t('settings.resetDefaults')}</Button></div>
          </Section>

          <Section id="sounds" title={t('settings.sections.sounds')}>
            <Row label={t('settings.soundEffects')} hint={t('settings.soundEffectsHint')}><Toggle checked={settings.sounds} onChange={(v) => void update({ sounds: v })} /></Row>
          </Section>

          <Section id="tts" title={t('settings.sections.tts')} description={t('settings.ttsHint')}>
            <Row label={t('settings.ttsEnabled')}><Toggle checked={settings.tts.enabled} onChange={(v) => void update({ tts: { ...settings.tts, enabled: v } })} /></Row>
            <Row label={t('settings.ttsRate')} htmlFor="s-rate">
              <div className="flex items-center gap-3">
                <input id="s-rate" type="range" min={0.5} max={1.5} step={0.1} value={settings.tts.rate} onChange={(e) => void update({ tts: { ...settings.tts, rate: Number(e.target.value) } })} className="w-full accent-primary" />
                <span className="w-12 text-right text-sm font-semibold tabular-nums">{settings.tts.rate.toFixed(1)}×</span>
              </div>
            </Row>
            <div className="mt-3"><TtsSettingsPanel /></div>
          </Section>

          <Section id="ai" title={t('settings.sections.ai')} description={t('settings.aiHint')}>
            <AiSettingsPanel />
          </Section>

          <Section id="notifications" title={t('settings.sections.notifications')} description={t('settings.notifHint')}>
            <Row label={t('settings.dailyReminder')} hint={perm === 'denied' ? t('settings.notifBlocked') : perm === 'unsupported' ? t('settings.notifUnsupported') : undefined}>
              <Toggle checked={settings.notifications.dailyReminder} onChange={(v) => void enableReminder(v)} disabled={perm === 'unsupported'} />
            </Row>
            <Row label={t('settings.reminderHour')} htmlFor="s-hour">
              <Select id="s-hour" value={settings.notifications.hour} onChange={(e) => notif({ hour: Number(e.target.value) })} disabled={!settings.notifications.dailyReminder}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </Select>
            </Row>
            {perm === 'granted' && (
              <div className="pt-2"><Button size="sm" variant="outline" onClick={() => void showSystemNotification(APP_NAME, t('settings.testNotifBody'), 'test')}>{t('settings.testNotif')}</Button></div>
            )}
          </Section>

          <Section id="data" title={t('settings.sections.data')} description={t('settings.dataHint')}>
            <div className="rounded-xl bg-surface-2 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium"><HardDrive size={16} />{t('settings.storageUsed')}</span>
                <span className="tabular-nums text-muted">{estimate ? `${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}` : '—'}</span>
              </div>
              {estimate && estimate.quota > 0 && <ProgressBar className="mt-2" value={estimate.usage} max={estimate.quota} />}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2"><Shield size={16} className={persisted ? 'text-accent' : 'text-muted'} />{persisted === null ? t('settings.persistUnknown') : persisted ? t('settings.persistOn') : t('settings.persistOff')}</span>
                {persisted === false && <Button size="sm" variant="outline" onClick={() => void requestPersistentStorage().then((ok) => { setPersisted(ok); if (!ok) toast.info(t('settings.persistDeniedHint')) })}>{t('settings.persistRequest')}</Button>}
              </div>
            </div>
            <div className="mt-4"><BackupPanel /></div>
            <div className="mt-6 rounded-xl border border-error/30 bg-error-soft/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-error"><Trash2 size={16} />{t('settings.wipeTitle')}</div>
                  <p className="mt-0.5 text-xs text-muted">{t('settings.wipeHint')}</p>
                </div>
                <Button variant="danger" size="sm" onClick={() => { setWipeText(''); setWipeOpen(true) }}>{t('settings.wipeButton')}</Button>
              </div>
            </div>
          </Section>

          <Section id="about" title={t('settings.sections.about')}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span><span className="text-muted">{t('settings.version')}:</span> <span className="font-semibold">{APP_NAME} {APP_VERSION}</span></span>
              <a href="https://github.com/PiMo131/MyQuiz" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"><Github size={16} />GitHub</a>
            </div>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent-soft/60 p-3 text-sm"><Shield size={16} className="mt-0.5 shrink-0 text-accent" />{t('settings.privacy')}</p>
            <p className="mt-2 text-xs text-faint">{t('settings.locale')}: {i18n.language}</p>
          </Section>
        </div>
      </div>

      <Modal
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        size="sm"
        title={t('settings.wipeTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setWipeOpen(false)}>{t('common:common.cancel')}</Button>
            <Button variant="danger" disabled={wipeText.trim().toUpperCase() !== wipeWord.toUpperCase()} onClick={() => void wipeAll().then(() => { try { localStorage.clear() } catch { /* ignore */ } location.reload() })}>{t('settings.wipeConfirm')}</Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('settings.wipeBody')}</p>
        <p className="mt-3 text-sm">{t('settings.wipeType', { word: wipeWord })}</p>
        <Input className="mt-2" value={wipeText} onChange={(e) => setWipeText(e.target.value)} autoFocus aria-label={wipeWord} />
      </Modal>
    </div>
  )
}
