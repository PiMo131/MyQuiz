import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, FileQuestion, RotateCcw, XCircle } from 'lucide-react'
import { db } from '@/db/db'
import { finishSession, getCards, recordOutcome, startSession } from '@/db/repo'
import type { Card, Session } from '@/domain/types'
import { useSettings } from '@/app/settings-store'
import {
  buildPracticeTest,
  cardsToSources,
  scoreTest,
  type PracticeQuestion,
  type PracticeQuestionType,
} from '@/domain/ai/practiceTest'
import { extractCards } from '@/domain/ai/cards'
import { practiceTestPrompt } from '@/domain/ai/prompts'
import { parsePracticeTest } from '@/domain/ai/schemas'
import { detectLang } from '@/domain/ai/lang'
import { plainText } from '@/domain/text'
import { Button, Input, Label, Ring, Tabs, cn, toast } from '@/ui'
import { SourceInput } from './components/SourceInput'
import { AiFooter, BetterResultsHint, ProviderChip } from './components/ProviderChip'
import { runPromptOrFallback } from './providers/router'
import type { ActiveProviderKind } from './providers/types'

const TYPES: PracticeQuestionType[] = ['multipleChoice', 'written', 'trueFalse']

export default function PracticeTestPage() {
  const { t, i18n } = useTranslation('ai')
  const grading = useSettings((s) => s.settings.grading)
  const sets = useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().toArray(), [])
  const counts = useLiveQuery(async () => {
    const all = await db.cards.toArray()
    const m: Record<string, number> = {}
    for (const c of all) m[c.setId] = (m[c.setId] ?? 0) + 1
    return m
  }, [])
  const [source, setSource] = useState<'sets' | 'text'>('sets')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  const [count, setCount] = useState(10)
  const [types, setTypes] = useState<Set<PracticeQuestionType>>(new Set(TYPES))
  const [busy, setBusy] = useState(false)
  const [questions, setQuestions] = useState<PracticeQuestion[] | null>(null)
  const [provider, setProvider] = useState<ActiveProviderKind>('heuristics')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ReturnType<typeof scoreTest> | null>(null)
  const cardsRef = useRef<Map<string, Card>>(new Map())
  const sessionRef = useRef<Session | null>(null)
  const abort = useRef<AbortController | null>(null)

  const canGenerate = source === 'sets' ? selected.size > 0 : text.trim().length >= 40
  const typeList = useMemo(() => TYPES.filter((x) => types.has(x)), [types])

  const generate = async () => {
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    setBusy(true)
    setResult(null)
    setAnswers({})
    try {
      let sources: { id?: string; term: string; definition: string; altAnswers?: string[] }[] = []
      cardsRef.current = new Map()
      let material = ''
      if (source === 'sets') {
        const all: Card[] = []
        for (const id of selected) all.push(...(await getCards(id)))
        for (const c of all) cardsRef.current.set(c.id, c)
        sources = cardsToSources(all)
        material = all.map((c) => `${plainText(c.term)}: ${plainText(c.definition)}`).join('\n')
        if (selected.size === 1)
          sessionRef.current = await startSession([...selected][0], 'test', {
            source: 'ai-practice-test',
            count,
          })
        else sessionRef.current = null
      } else {
        sources = extractCards(text, { max: 60 })
        material = text
        sessionRef.current = null
      }
      const lang = detectLang(material) || i18n.language
      const heuristic = () => buildPracticeTest(sources, { count, types: typeList })
      const { value, provider: p } = await runPromptOrFallback(
        practiceTestPrompt(material, { count, types: typeList, lang }),
        (raw) =>
          parsePracticeTest(raw)
            .filter((q) => types.has(q.type))
            .slice(0, count),
        heuristic,
        { signal: ctl.signal, accept: (qs) => qs.length >= Math.min(3, count) },
      )
      // link LLM questions back to cards by prompt text when possible (for progress recording)
      const byTerm = new Map(
        [...cardsRef.current.values()].map((c) => [plainText(c.term).toLowerCase(), c.id]),
      )
      const linked = value.map((q) =>
        q.cardId ? q : { ...q, cardId: byTerm.get(plainText(q.prompt).toLowerCase()) },
      )
      if (!linked.length) toast.info(t('test.none'))
      setQuestions(linked)
      setProvider(p)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    if (!questions) return
    const r = scoreTest(questions, answers, grading)
    setResult(r)
    const sessionAnswers = []
    for (const q of questions) {
      const g = r.results[q.id]
      const card = q.cardId ? cardsRef.current.get(q.cardId) : undefined
      if (card) await recordOutcome(card, g.correct, 'test')
      sessionAnswers.push({
        cardId: q.cardId ?? '',
        questionType: q.type,
        prompt: q.prompt,
        given: answers[q.id] ?? '',
        expected: g.expected,
        correct: g.correct,
        durationMs: 0,
      })
    }
    if (sessionRef.current) {
      await finishSession(sessionRef.current, {
        score: r.total ? r.correct / r.total : 0,
        total: r.total,
        answers: sessionAnswers,
      })
      sessionRef.current = null
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const reset = () => {
    setQuestions(null)
    setResult(null)
    setAnswers({})
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-orange text-white">
          <FileQuestion size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t('test.title')}</h1>
          <p className="text-sm text-muted">{t('test.subtitle')}</p>
        </div>
        <ProviderChip />
      </header>

      {!questions && (
        <section className="card space-y-4 p-5">
          <Tabs
            items={[
              { value: 'sets', label: t('test.fromSets'), count: selected.size || undefined },
              { value: 'text', label: t('source.tabs.paste') },
            ]}
            value={source}
            onChange={setSource}
            variant="underline"
          />
          {source === 'sets' ? (
            sets?.length ? (
              <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                {sets.map((s) => {
                  const on = selected.has(s.id)
                  return (
                    <li key={s.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2',
                          on && 'bg-primary-soft/40',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setSelected((sel) => {
                              const n = new Set(sel)
                              if (n.has(s.id)) n.delete(s.id)
                              else n.add(s.id)
                              return n
                            })
                          }
                          className="accent-primary"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                        <span className="text-xs text-muted">
                          {t('common.terms', { ns: 'common', count: counts?.[s.id] ?? 0 })}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t('hub.noSets')}</p>
            )
          ) : (
            <SourceInput value={text} onChange={setText} />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pt-count">{t('test.count', { count })}</Label>
              <input
                id="pt-count"
                type="range"
                min={3}
                max={30}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="mt-2 w-full accent-primary"
              />
            </div>
            <div>
              <Label>{t('test.types')}</Label>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((ty) => (
                  <button
                    key={ty}
                    type="button"
                    aria-pressed={types.has(ty)}
                    onClick={() =>
                      setTypes((s) => {
                        const n = new Set(s)
                        if (n.has(ty)) {
                          if (n.size > 1) n.delete(ty)
                        } else n.add(ty)
                        return n
                      })
                    }
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm',
                      types.has(ty) ? 'border-primary bg-primary-soft text-primary' : 'border-border',
                    )}
                  >
                    {t(`test.type.${ty}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <BetterResultsHint />
          <div className="flex justify-end">
            <Button
              variant="gradient"
              size="lg"
              disabled={!canGenerate}
              loading={busy}
              onClick={() => void generate()}
            >
              {t('generate.generate')}
            </Button>
          </div>
        </section>
      )}

      {questions && (
        <section className="space-y-4">
          {result && (
            <div className="card flex items-center gap-4 p-5">
              <Ring
                value={result.total ? (result.correct / result.total) * 100 : 0}
                size={72}
                label={`${Math.round(result.total ? (result.correct / result.total) * 100 : 0)}%`}
              />
              <div className="flex-1">
                <div className="text-lg font-bold">
                  {t('test.score', { correct: result.correct, total: result.total })}
                </div>
                <p className="text-sm text-muted">
                  {result.correct === result.total ? t('test.perfect') : t('test.keepGoing')}
                </p>
              </div>
              <Button variant="outline" onClick={reset} leftIcon={<RotateCcw size={16} />}>
                {t('test.again')}
              </Button>
            </div>
          )}
          {questions.map((q, i) => {
            const g = result?.results[q.id]
            const given = answers[q.id] ?? ''
            return (
              <div
                key={q.id}
                className={cn('card space-y-3 p-5', g && (g.correct ? 'border-accent' : 'border-error'))}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {i + 1}. {t(`test.type.${q.type}`)}
                  </div>
                  {g &&
                    (g.correct ? (
                      <CheckCircle2 className="text-accent" size={20} />
                    ) : (
                      <XCircle className="text-error" size={20} />
                    ))}
                </div>
                <div className="text-lg font-medium">{q.prompt}</div>
                {q.type === 'trueFalse' && (
                  <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">{q.statement}</p>
                )}
                {q.type === 'multipleChoice' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.options?.map((o, j) => (
                      <button
                        key={j}
                        type="button"
                        disabled={!!result}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                        className={cn(
                          'rounded-xl border px-4 py-3 text-left text-sm transition',
                          given === o ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2',
                          result && o === q.answer && 'border-accent bg-accent-soft',
                          result && given === o && o !== q.answer && 'border-error bg-error-soft',
                        )}
                      >
                        <span className="mr-2 text-xs text-muted">{j + 1}</span>
                        {o}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'trueFalse' && (
                  <div className="flex gap-2">
                    {(['true', 'false'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        disabled={!!result}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                        className={cn(
                          'flex-1 rounded-xl border px-4 py-3 text-sm font-medium',
                          given === v ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2',
                          result && v === q.answer && 'border-accent bg-accent-soft',
                        )}
                      >
                        {t(`test.${v}`)}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'written' && (
                  <Input
                    value={given}
                    disabled={!!result}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder={t('test.typeAnswer')}
                  />
                )}
                {g && !g.correct && (
                  <p className="text-sm">
                    <span className="text-muted">{t('test.correctAnswer')}:</span>{' '}
                    <span className="font-semibold">
                      {q.type === 'trueFalse' ? t(`test.${q.answer as 'true' | 'false'}`) : g.expected}
                    </span>
                  </p>
                )}
              </div>
            )
          })}
          {!result && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                {t('common.cancel', { ns: 'common' })}
              </Button>
              <Button size="lg" onClick={() => void check()}>
                {t('test.check')}
              </Button>
            </div>
          )}
        </section>
      )}
      <AiFooter provider={questions ? provider : undefined} />
    </div>
  )
}
