import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Headphones, Pause, Play, Settings2, SkipBack, SkipForward, Sparkles, X } from 'lucide-react'
import { db } from '@/db/db'
import { getCards, touchStudied } from '@/db/repo'
import type { Card } from '@/domain/types'
import { buildListenScript, estimateDuration, type ScriptSegment } from '@/domain/ai/script'
import { podcastPrompt } from '@/domain/ai/prompts'
import { parseScript } from '@/domain/ai/schemas'
import { plainText } from '@/domain/text'
import { useSettings } from '@/app/settings-store'
import { Button, Dropdown, EmptyState, ProgressBar, cn, toast } from '@/ui'
import { speak, stop, useTtsStore, wait } from '@/features/tts'
import { AiFooter, ProviderChip } from './components/ProviderChip'
import { resolveProvider, runPrompt } from './providers/router'
import type { ActiveProviderKind } from './providers/types'
import { useAiStatus } from './useAiStatus'

const SPEEDS = [0.8, 1, 1.2, 1.5]
const MODES = ['flashcards', 'learn', 'write', 'test', 'match'] as const

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ListenPage() {
  const { setId = '' } = useParams()
  const { t, i18n } = useTranslation('ai')
  const { t: tc } = useTranslation()
  const navigate = useNavigate()
  const set = useLiveQuery(() => db.sets.get(setId), [setId])
  const [cards, setCards] = useState<Card[] | null>(null)
  const settingsRate = useSettings((s) => s.settings.tts.rate)
  const ttsSupported = useTtsStore((s) => s.supported)
  const status = useAiStatus()
  const [script, setScript] = useState<ScriptSegment[] | null>(null)
  const [provider, setProvider] = useState<ActiveProviderKind>('heuristics')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(settingsRate || 1)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [generating, setGenerating] = useState(false)
  const run = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    void getCards(setId).then(setCards)
    void touchStudied(setId)
  }, [setId])
  useEffect(() => () => { run.current?.abort(); stop() }, [])

  useEffect(() => {
    if (set && cards && !script) setScript(buildListenScript(set, cards, { uiLang: i18n.language }))
  }, [set, cards, script, i18n.language])

  const total = useMemo(() => (script ? estimateDuration(script, speed) : 0), [script, speed])
  const elapsed = useMemo(() => (script ? estimateDuration(script.slice(0, index), speed) : 0), [script, index, speed])
  const current = script?.[index]
  const currentCardId = current?.cardId

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentCardId, index])

  const stopPlayback = useCallback(() => {
    run.current?.abort()
    run.current = null
    stop()
    setPlaying(false)
  }, [])

  const playFrom = useCallback(
    (start: number) => {
      if (!script) return
      run.current?.abort()
      const ctl = new AbortController()
      run.current = ctl
      setPlaying(true)
      void (async () => {
        for (let i = start; i < script.length; i++) {
          if (ctl.signal.aborted) return
          setIndex(i)
          const seg = script[i]
          await speak(seg.text, seg.lang, { rate: speed })
          if (ctl.signal.aborted) return
          if (seg.pauseMs) await wait(seg.pauseMs / speed, ctl.signal)
          if (ctl.signal.aborted) return
          if (!autoAdvance && seg.kind === 'definition') {
            setPlaying(false)
            return
          }
        }
        setPlaying(false)
      })()
    },
    [script, speed, autoAdvance],
  )

  const toggle = () => (playing ? stopPlayback() : playFrom(index >= (script?.length ?? 0) - 1 && !playing && index > 0 ? 0 : index))
  const skip = (dir: -1 | 1) => {
    if (!script) return
    // jump by card (term segment), not by raw segment
    let i = index + dir
    while (i > 0 && i < script.length && script[i].kind !== 'term' && script[i].kind !== 'intro' && script[i].kind !== 'outro') i += dir
    i = Math.max(0, Math.min(script.length - 1, i))
    if (playing) playFrom(i)
    else setIndex(i)
  }
  const jumpToCard = (cardId: string) => {
    const i = script?.findIndex((s) => s.cardId === cardId && s.kind === 'term') ?? -1
    if (i >= 0) (playing ? playFrom(i) : setIndex(i))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === ' ') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowLeft') skip(-1)
      else if (e.key === 'ArrowRight') skip(1)
      else if (e.key === 'Escape') navigate(`/set/${setId}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const generateConversational = async () => {
    if (!set || !cards) return
    const p = await resolveProvider()
    if (!p) return toast.info(t('provider.betterResults'))
    setGenerating(true)
    stopPlayback()
    try {
      const usable = cards.filter((c) => !c.suspended)
      const lang = set.lang.definition || i18n.language
      const segs = await runPrompt(podcastPrompt(set.title, usable, lang), (raw) => parseScript(raw, lang, usable.map((c) => c.id)))
      if (segs.length < 3) throw new Error(t('listen.scriptFailed'))
      setScript(segs)
      setProvider(p.kind)
      setIndex(0)
      toast.success(t('listen.scriptReady'))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const useTemplate = () => {
    if (!set || !cards) return
    stopPlayback()
    setScript(buildListenScript(set, cards, { uiLang: i18n.language }))
    setProvider('heuristics')
    setIndex(0)
  }

  if (set === undefined || cards === null) return <div className="grid min-h-dvh place-items-center text-muted">{tc('common.loading')}</div>
  if (!set) return <div className="grid min-h-dvh place-items-center"><EmptyState title={tc('common.notFound')} action={<Link to="/"><Button variant="secondary">{tc('common.goHome')}</Button></Link>} /></div>

  const pct = total ? Math.min(100, (elapsed / total) * 100) : 0

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 items-center gap-2 border-b border-border px-3 sm:px-5">
        <Dropdown
          align="left"
          trigger={
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-semibold hover:bg-surface-2">
              <Headphones size={18} className="text-primary" />
              {t('listen.mode')}
              <ChevronDown size={16} className="text-muted" />
            </button>
          }
          items={MODES.map((m) => ({ label: tc(`modes.${m}`), onSelect: () => navigate(`/set/${setId}/${m}`) }))}
        />
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold">{set.title}</div>
          <div className="text-xs text-muted">
            {script ? `${index + 1} / ${script.length}` : ''} · {fmt(elapsed)} / {fmt(total)}
          </div>
        </div>
        <button type="button" onClick={() => setShowSettings((v) => !v)} aria-label={tc('common.settings')} aria-expanded={showSettings} className={cn('rounded-lg p-2 text-muted hover:bg-surface-2', showSettings && 'bg-surface-2 text-text')}>
          <Settings2 size={20} />
        </button>
        <Link to={`/set/${setId}`} aria-label={tc('common.close')} className="rounded-lg p-2 text-muted hover:bg-surface-2">
          <X size={20} />
        </Link>
      </header>

      {showSettings && (
        <div className="border-b border-border bg-surface px-4 py-3 text-sm sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} className="accent-primary" />
              {t('listen.autoAdvance')}
            </label>
            <div className="inline-flex items-center gap-1">
              <span className="text-muted">{t('listen.speed')}</span>
              {SPEEDS.map((s) => (
                <button key={s} type="button" onClick={() => { setSpeed(s); if (playing) stopPlayback() }} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', speed === s ? 'bg-primary text-white' : 'bg-surface-2')}>
                  {s}×
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {status.llm && provider === 'heuristics' && (
                <Button size="sm" variant="outline" loading={generating} onClick={() => void generateConversational()} leftIcon={<Sparkles size={14} />}>
                  {t('listen.generateScript')}
                </Button>
              )}
              {provider !== 'heuristics' && (
                <Button size="sm" variant="ghost" onClick={useTemplate}>
                  {t('listen.useTemplate')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        {!ttsSupported && <p className="rounded-xl bg-error-soft px-3 py-2 text-sm text-error">{t('tts.unsupported')}</p>}
        <section className="card flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{current ? t(`listen.kind.${current.kind}`) : ''}</div>
          <div className={cn('text-balance text-xl font-semibold leading-snug sm:text-2xl', current?.kind === 'term' && 'text-primary')}>{current?.text}</div>
          {current?.kind === 'term' && playing && <div className="text-sm text-muted">{t('listen.thinkPause')}</div>}
        </section>

        <section className="space-y-3">
          <ProgressBar value={pct} />
          <div className="flex items-center justify-center gap-4">
            <button type="button" onClick={() => skip(-1)} aria-label={t('listen.prev')} className="rounded-full p-3 hover:bg-surface-2">
              <SkipBack size={24} />
            </button>
            <button type="button" onClick={toggle} aria-label={playing ? t('listen.pause') : t('listen.play')} className="grid h-16 w-16 place-items-center rounded-full bg-gradient-indigo text-white shadow-pop" disabled={!ttsSupported || !script?.length}>
              {playing ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
            </button>
            <button type="button" onClick={() => skip(1)} aria-label={t('listen.next')} className="rounded-full p-3 hover:bg-surface-2">
              <SkipForward size={24} />
            </button>
          </div>
          <p className="text-center text-xs text-muted">{t('listen.keys')}</p>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{tc('common.terms', { count: cards.length })}</h2>
          <ol ref={listRef} className="max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-border p-2">
            {cards.filter((c) => !c.suspended).map((c, i) => {
              const active = c.id === currentCardId
              return (
                <li key={c.id}>
                  <button type="button" data-active={active} onClick={() => jumpToCard(c.id)} className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition', active ? 'bg-primary-soft' : 'hover:bg-surface-2')}>
                    <span className="w-6 shrink-0 text-xs text-muted">{i + 1}</span>
                    <span className={cn('font-medium', active && 'text-primary')}>{plainText(c.term)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{plainText(c.definition)}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
        <div className="mt-auto">
          <AiFooter provider={provider} />
          {provider === 'heuristics' && <p className="mt-1 text-right text-[11px] text-muted">{t('listen.templateNote')} <ProviderChip provider="heuristics" className="align-middle" /></p>}
        </div>
      </main>
    </div>
  )
}
