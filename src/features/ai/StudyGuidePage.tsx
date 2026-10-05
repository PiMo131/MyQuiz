import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpenText, ChevronDown, ChevronRight, Layers, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import { addCards, createSet } from '@/db/repo'
import { newId, now } from '@/domain/id'
import { buildStudyGuide, type StudyGuide } from '@/domain/ai/studyGuide'
import { extractCards } from '@/domain/ai/cards'
import { studyGuidePrompt } from '@/domain/ai/prompts'
import { parseStudyGuide } from '@/domain/ai/schemas'
import { detectLang } from '@/domain/ai/lang'
import { Button, Markdown, cn, toast } from '@/ui'
import { SourceInput } from './components/SourceInput'
import { AiFooter, BetterResultsHint, ProviderChip } from './components/ProviderChip'
import { runPromptOrFallback } from './providers/router'
import type { ActiveProviderKind } from './providers/types'

interface SavedGuide {
  id: string
  createdAt: number
  provider: ActiveProviderKind
  guide: StudyGuide
}

const KEY_PREFIX = 'studyguide:'

export default function StudyGuidePage() {
  const { t, i18n } = useTranslation('ai')
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState<SavedGuide | null>(null)
  const abort = useRef<AbortController | null>(null)
  const saved = useLiveQuery(async () => {
    const rows = await db.kv.where('key').startsWith(KEY_PREFIX).toArray()
    return rows.map((r) => r.value as SavedGuide).sort((a, b) => b.createdAt - a.createdAt)
  }, [])

  const run = async () => {
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    setBusy(true)
    const lang = detectLang(text) || i18n.language
    try {
      const heuristic = () => buildStudyGuide(text, { lang })
      const { value, provider } = await runPromptOrFallback(
        studyGuidePrompt(text, lang),
        (raw) => {
          const g = parseStudyGuide(raw, heuristic().title)
          return { ...g, cards: g.keyTerms.filter((k) => k.definition).map((k) => ({ term: k.term, definition: k.definition! })).concat(extractCards(text, { max: 30 })).slice(0, 60) }
        },
        heuristic,
        { signal: ctl.signal, accept: (g) => g.outline.length + g.keyTerms.length + g.summary.length > 0 },
      )
      const sg: SavedGuide = { id: newId(), createdAt: now(), provider, guide: value }
      await db.kv.put({ key: KEY_PREFIX + sg.id, value: sg })
      setCurrent(sg)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const removeGuide = async (id: string) => {
    await db.kv.delete(KEY_PREFIX + id)
    if (current?.id === id) setCurrent(null)
  }

  const makeCards = async (g: StudyGuide) => {
    const cards: { term: string; definition: string; hint?: string }[] = g.cards.length ? g.cards : g.keyTerms.filter((k) => k.definition).map((k) => ({ term: k.term, definition: k.definition! }))
    if (!cards.length) return toast.info(t('guide.noCards'))
    const set = await createSet({ title: g.title, description: g.summary[0] ?? '' })
    await addCards(set.id, cards.map((c) => ({ setId: set.id, term: c.term, definition: c.definition, hint: c.hint })))
    toast.success(t('generate.saved', { count: cards.length }))
    navigate(`/set/${set.id}`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-teal text-white">
          <BookOpenText size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t('guide.title')}</h1>
          <p className="text-sm text-muted">{t('guide.subtitle')}</p>
        </div>
        <ProviderChip />
      </header>

      {!current && (
        <section className="card space-y-4 p-5">
          <SourceInput value={text} onChange={setText} />
          <div className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            <span className="font-semibold">{t('guide.alsoGet')}</span> {t('guide.alsoGetDesc')}
          </div>
          <BetterResultsHint />
          <div className="flex justify-end">
            <Button variant="gradient" size="lg" disabled={text.trim().length < 40} loading={busy} onClick={() => void run()}>
              {t('generate.generate')}
            </Button>
          </div>
        </section>
      )}

      {current && <GuideView saved={current} onBack={() => setCurrent(null)} onMakeCards={() => void makeCards(current.guide)} />}

      {!!saved?.length && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t('guide.saved')}</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {saved.map((s) => (
              <li key={s.id} className={cn('flex items-center gap-3 px-4 py-2.5', current?.id === s.id && 'bg-primary-soft/40')}>
                <button type="button" onClick={() => setCurrent(s)} className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-primary">
                  {s.guide.title}
                </button>
                <span className="text-xs text-muted">{new Date(s.createdAt).toLocaleDateString()}</span>
                <button type="button" onClick={() => void removeGuide(s.id)} className="rounded-full p-1.5 text-muted hover:bg-error-soft hover:text-error" aria-label={t('common.delete', { ns: 'common' })}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AiFooter provider={current?.provider} />
    </div>
  )
}

function GuideView({ saved, onBack, onMakeCards }: { saved: SavedGuide; onBack: () => void; onMakeCards: () => void }) {
  const { t } = useTranslation('ai')
  const g = saved.guide
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  return (
    <article className="card space-y-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{g.title}</h2>
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            {t('footer.enhanced')} <ProviderChip provider={saved.provider} />
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            {t('guide.newGuide')}
          </Button>
          <Button size="sm" onClick={onMakeCards} leftIcon={<Layers size={14} />}>
            {t('guide.makeCards')}
          </Button>
        </div>
      </div>

      {g.summary.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t('guide.summary')}</h3>
          <p className="leading-relaxed">{g.summary.join(' ')}</p>
        </section>
      )}

      {g.outline.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t('guide.outline')}</h3>
          <div className="space-y-3">
            {g.outline.map((s, i) => (
              <div key={i}>
                <div className="font-semibold">{s.heading}</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {s.points.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {g.keyTerms.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t('guide.keyTerms')}</h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            {g.keyTerms.map((k, i) => (
              <div key={i} className="rounded-xl border border-border px-3 py-2 text-sm">
                <dt className="font-semibold">{k.term}</dt>
                {k.definition && <dd className="text-muted">{k.definition}</dd>}
              </div>
            ))}
          </dl>
        </section>
      )}

      {g.questions.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t('guide.questions')}</h3>
          <ul className="space-y-2">
            {g.questions.map((q, i) => {
              const open = revealed.has(i)
              return (
                <li key={i} className="rounded-xl border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
                    aria-expanded={open}
                    onClick={() => setRevealed((r) => { const n = new Set(r); if (n.has(i)) n.delete(i); else n.add(i); return n })}
                  >
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <Markdown src={q.question} />
                  </button>
                  {open && <div className="border-t border-border px-3 py-2 text-sm text-muted">{q.answer}</div>}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </article>
  )
}
