import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, WandSparkles } from 'lucide-react'
import { db } from '@/db/db'
import { addCards, createSet } from '@/db/repo'
import type { CardStyle } from '@/domain/ai/cards'
import { Button, Input, Label, Select, Tabs, toast } from '@/ui'
import { generateCardsDetailed, type GeneratedCard } from './api'
import { SourceInput } from './components/SourceInput'
import { AiFooter, BetterResultsHint, ProviderChip } from './components/ProviderChip'
import type { ActiveProviderKind } from './providers/types'

const LANGS = ['auto', 'nl', 'en', 'de', 'fr', 'es'] as const
const STYLES: CardStyle[] = ['termDefinition', 'qa', 'cloze']

export default function GeneratePage() {
  const { t } = useTranslation('ai')
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [lang, setLang] = useState<(typeof LANGS)[number]>('auto')
  const [count, setCount] = useState(20)
  const [style, setStyle] = useState<CardStyle>('termDefinition')
  const [busy, setBusy] = useState(false)
  const [cards, setCards] = useState<GeneratedCard[] | null>(null)
  const [provider, setProvider] = useState<ActiveProviderKind>('heuristics')
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState<'new' | 'existing'>('new')
  const [existing, setExisting] = useState('')
  const abort = useRef<AbortController | null>(null)
  const sets = useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().toArray(), [])
  const firstLine = useMemo(
    () =>
      text
        .split('\n')
        .map((l) => l.trim())
        .find(Boolean)
        ?.replace(/^#+\s*/, '')
        .slice(0, 60) ?? '',
    [text],
  )

  const run = async () => {
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    setBusy(true)
    try {
      const r = await generateCardsDetailed(text, {
        lang: lang === 'auto' ? undefined : lang,
        count,
        style,
        signal: ctl.signal,
      })
      setCards(r.cards)
      setProvider(r.provider)
      if (!title) setTitle(firstLine)
      if (!r.cards.length) toast.info(t('generate.none'))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const edit = (i: number, patch: Partial<GeneratedCard>) =>
    setCards((cs) => (cs ? cs.map((c, j) => (j === i ? { ...c, ...patch } : c)) : cs))
  const remove = (i: number) => setCards((cs) => (cs ? cs.filter((_, j) => j !== i) : cs))

  const save = async () => {
    if (!cards?.length) return
    const valid = cards.filter((c) => c.term.trim() && c.definition.trim())
    const inputs = valid.map((c) => ({
      term: c.term.trim(),
      definition: c.definition.trim(),
      hint: c.hint?.trim() || undefined,
      cloze: c.cloze ?? null,
    }))
    try {
      let setId = existing
      if (target === 'new' || !existing) {
        const l = lang === 'auto' ? '' : lang
        const set = await createSet({
          title: title.trim() || t('generate.untitled'),
          lang: { term: l, definition: l },
          cardTypes: style === 'cloze' ? ['cloze'] : ['basic'],
        })
        setId = set.id
      }
      await addCards(
        setId,
        inputs.map((c) => ({ ...c, setId })),
      )
      toast.success(t('generate.saved', { count: inputs.length }))
      navigate(`/set/${setId}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-indigo text-white">
          <WandSparkles size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t('generate.title')}</h1>
          <p className="text-sm text-muted">{t('generate.subtitle')}</p>
        </div>
        <ProviderChip />
      </header>

      <section className="card space-y-4 p-5">
        <SourceInput value={text} onChange={setText} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="gen-lang">{t('generate.language')}</Label>
            <Select
              id="gen-lang"
              value={lang}
              onChange={(e) => setLang(e.target.value as (typeof LANGS)[number])}
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {t(`langs.${l}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="gen-count">{t('generate.count', { count })}</Label>
            <input
              id="gen-count"
              type="range"
              min={5}
              max={60}
              step={5}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </div>
          <div>
            <Label>{t('generate.style')}</Label>
            <Tabs
              items={STYLES.map((s) => ({ value: s, label: t(`generate.styles.${s}`) }))}
              value={style}
              onChange={setStyle}
            />
          </div>
        </div>
        <BetterResultsHint />
        <div className="flex justify-end">
          <Button
            variant="gradient"
            size="lg"
            disabled={text.trim().length < 20}
            loading={busy}
            onClick={() => void run()}
            leftIcon={<WandSparkles size={18} />}
          >
            {t('generate.generate')}
          </Button>
        </div>
      </section>

      {cards && (
        <section className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t('generate.preview', { count: cards.length })}</h2>
            <span className="inline-flex items-center gap-2 text-xs text-muted">
              {t('footer.enhanced')} <ProviderChip provider={provider} />
            </span>
          </div>
          <ul className="space-y-2">
            {cards.map((c, i) => (
              <li
                key={i}
                className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <Input
                  value={c.term}
                  onChange={(e) => edit(i, { term: e.target.value })}
                  aria-label={t('common.term', { ns: 'common' })}
                />
                <Input
                  value={c.definition}
                  onChange={(e) => edit(i, { definition: e.target.value })}
                  aria-label={t('common.definition', { ns: 'common' })}
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="justify-self-end rounded-full p-2 text-muted hover:bg-error-soft hover:text-error"
                  aria-label={t('common.delete', { ns: 'common' })}
                >
                  <Trash2 size={16} />
                </button>
                {c.cloze && <p className="text-xs text-muted sm:col-span-3">{c.cloze}</p>}
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCards((cs) => [...(cs ?? []), { term: '', definition: '' }])}
            leftIcon={<Plus size={14} />}
          >
            {t('generate.addRow')}
          </Button>
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
            <div>
              <Label>{t('generate.target')}</Label>
              <Tabs
                items={[
                  { value: 'new', label: t('generate.newSet') },
                  { value: 'existing', label: t('generate.existingSet') },
                ]}
                value={target}
                onChange={setTarget}
              />
            </div>
            <div>
              {target === 'new' ? (
                <>
                  <Label htmlFor="gen-title">{t('generate.setTitle')}</Label>
                  <Input
                    id="gen-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={firstLine || t('generate.untitled')}
                  />
                </>
              ) : (
                <>
                  <Label htmlFor="gen-existing">{t('generate.chooseSet')}</Label>
                  <Select id="gen-existing" value={existing} onChange={(e) => setExisting(e.target.value)}>
                    <option value="">—</option>
                    {sets?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </Select>
                </>
              )}
            </div>
            <Button
              size="lg"
              disabled={!cards.length || (target === 'existing' && !existing)}
              onClick={() => void save()}
            >
              {target === 'new' ? t('generate.createSet') : t('generate.addToSet')}
            </Button>
          </div>
        </section>
      )}
      <AiFooter provider={cards ? provider : undefined} />
    </div>
  )
}
