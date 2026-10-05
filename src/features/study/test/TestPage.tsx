import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowDown, ArrowUp, Check, ChevronDown, List, Printer, RotateCcw, X } from 'lucide-react'
import { finishSession, recordOutcome, startSession } from '@/db/repo'
import type { Card, QuestionType, Session, SessionAnswer, StudySet } from '@/domain/types'
import {
  clozeCards,
  isAnswered,
  type FillBlankQuestion,
  type MatchingQuestion,
  type MultiSelectQuestion,
  type MultipleChoiceQuestion,
  type OrderingQuestion,
  type Question,
  type Response,
  type TrueFalseQuestion,
  type WrittenQuestion,
  type AnswerWith,
} from '@/domain/question-generator'
import { useSettings } from '@/app/settings-store'
import { Badge, Button, Input, Modal, Ring, Select, Toggle, cn } from '@/ui'
import { StudyHeader } from '../shared/StudyHeader'
import { useSetData } from '../shared/useSetData'
import { CardFace } from '../shared/CardFace'
import { SpeakButton } from '../shared/SpeakButton'
import { AnswerDiff } from '../shared/AnswerDiff'
import { usePref } from '../shared/usePref'
import { sfx } from '../shared/sounds'
import { celebrate } from '../shared/confetti'
import { endStudy } from '../shared/session-end'
import { DEFAULT_TEST_SETUP, answeredCount, cardOutcomes, createTest, redemption, respond, score, submit, totalQuestions, wrongCardIds, type TestSetup, type TestState } from './engine'

const SECTION_TYPES: QuestionType[] = ['trueFalse', 'multipleChoice', 'matching', 'written']
const EXTRA_TYPES: QuestionType[] = ['ordering', 'multiSelect', 'fillBlank']

export default function TestPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation('study')
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const { set, cards, loading } = useSetData(setId)
  const [stored, setStored] = usePref<Partial<TestSetup>>('test.setup', {})
  const [setupOpen, setSetupOpen] = useState(true)
  const [draft, setDraft] = useState<TestSetup>({ ...DEFAULT_TEST_SETUP, ...stored, types: { ...DEFAULT_TEST_SETUP.types, ...stored.types } })
  const [more, setMore] = useState(false)
  const [state, setState] = useState<TestState | null>(null)
  const [nav, setNav] = useState(false)
  const dbSession = useRef<Session | null>(null)
  const hasCloze = useMemo(() => clozeCards(cards).length > 0, [cards])

  const usable = cards.filter((c) => !c.suspended).length
  const start = async (setup: TestSetup, subset?: Card[]) => {
    const list = subset ?? cards
    const s = createTest(list, { ...setup, count: Math.min(setup.count, list.length) })
    setState(s)
    setSetupOpen(false)
    setStored(setup)
    window.scrollTo({ top: 0 })
    dbSession.current = await startSession(setId, 'test', { count: setup.count, answerWith: setup.answerWith, types: Object.keys(setup.types).filter((k) => setup.types[k as QuestionType]) })
  }

  const onRespond = useCallback((id: string, r: Response) => setState((s) => (s ? respond(s, id, r) : s)), [])

  const doSubmit = async () => {
    if (!state) return
    const graded = submit(state, settings.grading)
    setState(graded)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    const sc = score(graded)
    if (settings.sounds) sfx.done()
    if (sc.percent >= 80) void celebrate()
    const byId = new Map(cards.map((c) => [c.id, c]))
    for (const o of cardOutcomes(graded)) {
      const card = byId.get(o.cardId)
      if (card) void recordOutcome(card, o.correct, 'test')
    }
    const answers: SessionAnswer[] = graded.questions.map((q) => {
      const r = graded.results[q.id]
      return { cardId: 'cardId' in q ? q.cardId : q.cardIds[0], questionType: q.type, prompt: 'prompt' in q ? q.prompt : '', given: r?.given ?? '', expected: r?.expected ?? '', correct: r?.correct ?? false, durationMs: 0 }
    })
    const s = dbSession.current
    if (s) {
      dbSession.current = null
      void finishSession(s, { answers, total: sc.total, score: sc.total ? sc.correct / sc.total : undefined })
    }
    void endStudy(setId)
  }

  const jump = (id: string) => {
    document.getElementById(`q-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setNav(false)
  }
  const focusNext = (id: string) => {
    if (!state) return
    const i = state.questions.findIndex((q) => q.id === id)
    const nxt = state.questions[i + 1]
    if (nxt) {
      jump(nxt.id)
      setTimeout(() => document.querySelector<HTMLInputElement>(`#q-${nxt.id} input`)?.focus(), 350)
    } else document.getElementById('submit-test')?.scrollIntoView({ behavior: 'smooth' })
  }

  if (loading || !set) return null
  const total = state ? totalQuestions(state.questions) : 0
  const answered = state ? answeredCount(state) : 0
  const sections = state ? groupSections(state.questions) : []

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StudyHeader
        mode="test"
        setId={setId}
        title={set.title}
        counter={`${answered} / ${total}`}
        right={
          <Link to={`/set/${setId}/print?test=1`} className="hidden sm:block">
            <Button variant="secondary" size="sm" leftIcon={<Printer size={16} />}>{t('test.printTest')}</Button>
          </Link>
        }
        onSettings={() => setSetupOpen(true)}
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 pb-16">
        {/* Navigator */}
        {state && (
          <>
            <button className={cn('fixed left-3 top-20 z-30 rounded-full border border-border bg-surface p-2 shadow-card lg:hidden')} onClick={() => setNav((n) => !n)} aria-label={t('test.questionList')} aria-expanded={nav}>
              {nav ? <X size={18} /> : <List size={18} />}
            </button>
            <aside className={cn('fixed inset-y-16 left-0 z-20 w-56 overflow-y-auto border-r border-border bg-bg p-4 transition-transform lg:sticky lg:top-20 lg:block lg:h-[calc(100dvh-6rem)] lg:translate-x-0 lg:border-0 lg:bg-transparent lg:p-0', nav ? 'translate-x-0 pt-14' : '-translate-x-full')}>
              <div className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-muted lg:block">{t('test.questionList')}</div>
              {sections.map((sec) => (
                <div key={sec.type} className="mb-4">
                  <div className="mb-1 text-sm font-bold text-primary">{t(`test.types.${sec.type}`)}</div>
                  <ul className="space-y-0.5">
                    {sec.questions.map((q) => {
                      const ok = isAnswered(q, state.responses[q.id])
                      const res = state.results[q.id]
                      return (
                        <li key={q.id}>
                          <button onClick={() => jump(q.id)} className={cn('flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-surface-2', ok && !state.submitted && 'text-muted')}>
                            <span>{state.numbers[q.id]}</span>
                            {state.submitted ? (
                              res?.correct ? <Check size={14} className="text-accent" /> : <X size={14} className="text-error" />
                            ) : ok ? (
                              <Check size={14} className="text-accent" />
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </aside>
          </>
        )}

        <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 pt-2">
          {state?.submitted && <Results state={state} cards={cards} setId={setId} setup={draft} onRedo={() => void start(draft)} onRedemption={() => { const r = redemption(state, cards, draft); if (r) { setState(r); window.scrollTo({ top: 0 }) } }} />}

          {state?.questions.map((q) => (
            <QuestionCard key={q.id} q={q} state={state} set={set} total={total} onRespond={onRespond} onNext={() => focusNext(q.id)} />
          ))}

          {state && !state.submitted && (
            <div id="submit-test" className="py-8 text-center">
              <div className="text-4xl" aria-hidden>📝</div>
              <h2 className="mt-3 text-xl font-bold">{answered === total ? t('test.allDone') : t('test.unanswered', { count: total - answered })}</h2>
              <Button size="lg" className="mt-4" onClick={() => void doSubmit()}>{t('test.submit')}</Button>
            </div>
          )}
        </main>
      </div>

      {/* Setup */}
      <Modal
        open={setupOpen}
        onClose={() => (state ? setSetupOpen(false) : navigate(`/set/${setId}`))}
        title={
          <div>
            <div className="text-sm font-medium text-muted">{set.title}</div>
            {t('test.setupTitle')}
          </div>
        }
        footer={<Button onClick={() => void start(draft)} disabled={!usable}>{t('test.start')}</Button>}
      >
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="text-sm font-medium">
              {t('test.questions')} <span className="text-muted">({t('test.max', { count: usable })})</span>
            </div>
            <Input type="number" min={1} max={usable} value={Math.min(draft.count, usable) || ''} onChange={(e) => setDraft({ ...draft, count: Math.max(1, Math.min(usable, Number(e.target.value) || 1)) })} className="w-24 text-center font-bold" />
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="text-sm font-medium">{t('learn.answerWith')}</div>
            <Select value={draft.answerWith} onChange={(e) => setDraft({ ...draft, answerWith: e.target.value as AnswerWith })} className="w-40">
              <option value="term">{t('common:common.term')}</option>
              <option value="definition">{t('common:common.definition')}</option>
              <option value="both">{t('common:common.both')}</option>
            </Select>
          </div>
          {SECTION_TYPES.map((k) => (
            <Toggle key={k} checked={draft.types[k]} onChange={(v) => setDraft({ ...draft, types: { ...draft.types, [k]: v } })} label={t(`test.types.${k}`)} />
          ))}
          <div className="py-2">
            <button className="flex w-full items-center justify-between py-1 text-sm font-semibold text-primary" onClick={() => setMore((m) => !m)} aria-expanded={more}>
              {t('test.moreTypes')} <ChevronDown size={16} className={cn('transition-transform', more && 'rotate-180')} />
            </button>
            {more &&
              EXTRA_TYPES.map((k) => (
                <Toggle key={k} checked={draft.types[k]} disabled={k === 'fillBlank' && !hasCloze} onChange={(v) => setDraft({ ...draft, types: { ...draft.types, [k]: v } })} label={t(`test.types.${k}`)} description={k === 'fillBlank' ? t(hasCloze ? 'test.fillBlankHint' : 'test.fillBlankNone') : undefined} />
              ))}
          </div>
          {!Object.values(draft.types).some(Boolean) && <p className="py-2 text-xs text-error">{t('test.pickType')}</p>}
        </div>
      </Modal>
    </div>
  )
}

function groupSections(questions: Question[]): Array<{ type: QuestionType; questions: Question[] }> {
  const out: Array<{ type: QuestionType; questions: Question[] }> = []
  for (const q of questions) {
    const last = out[out.length - 1]
    if (last && last.type === q.type) last.questions.push(q)
    else out.push({ type: q.type, questions: [q] })
  }
  return out
}

// ---------- results ----------

function Results({ state, cards, setId, setup, onRedo, onRedemption }: { state: TestState; cards: Card[]; setId: string; setup: TestSetup; onRedo: () => void; onRedemption: () => void }) {
  const { t } = useTranslation('study')
  const sc = score(state)
  const wrong = wrongCardIds(state).length
  void cards
  void setup
  return (
    <div className="card p-6">
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <Ring value={sc.percent} size={120} stroke={10} label={`${sc.percent}%`} />
        <div className="flex-1 text-center sm:text-left">
          <h2 className="text-2xl font-bold">{sc.percent === 100 ? t('test.perfect') : sc.percent >= 80 ? t('test.great') : t('test.keepGoing')}</h2>
          <p className="mt-1 text-sm text-muted">{t('test.scoreBody', { correct: sc.correct, total: sc.total })}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            {wrong > 0 && <Button onClick={onRedemption} leftIcon={<RotateCcw size={16} />}>{t('test.redemption', { count: wrong })}</Button>}
            <Button variant="secondary" onClick={onRedo}>{t('test.newTest')}</Button>
            <Link to={`/set/${setId}/print?test=1`}><Button variant="secondary" leftIcon={<Printer size={16} />}>{t('set.print')}</Button></Link>
            <Link to={`/set/${setId}`}><Button variant="ghost">{t('study.backToSet')}</Button></Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- question cards ----------

interface QProps<Q extends Question> {
  q: Q
  state: TestState
  set: StudySet
  total: number
  onRespond: (id: string, r: Response) => void
  onNext: () => void
}

function QuestionCard(props: QProps<Question>) {
  const { q, state, total } = props
  const { t } = useTranslation('study')
  const res = state.results[q.id]
  return (
    <section id={`q-${q.id}`} className={cn('card scroll-mt-20 p-5 sm:p-6', res && (res.correct ? 'border-accent/60' : 'border-error/60'))} aria-label={`${t('test.question')} ${state.numbers[q.id]}`}>
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>{q.type === 'matching' ? t('test.matchingQuestions') : q.type === 'ordering' ? t('test.types.ordering') : q.type === 'multiSelect' ? t('test.types.multiSelect') : ''}</span>
        <span className="flex items-center gap-2">
          {res && <Badge tone={res.correct ? 'accent' : 'error'}>{res.correct ? t('common:common.correct') : t('common:common.incorrect')}</Badge>}
          {t('test.nOf', { n: state.numbers[q.id], total })}
        </span>
      </div>
      {q.type === 'trueFalse' && <TrueFalseCard {...(props as QProps<TrueFalseQuestion>)} />}
      {q.type === 'multipleChoice' && <McCard {...(props as QProps<MultipleChoiceQuestion>)} />}
      {q.type === 'matching' && <MatchingCard {...(props as QProps<MatchingQuestion>)} />}
      {q.type === 'written' && <WrittenCard {...(props as QProps<WrittenQuestion>)} />}
      {q.type === 'fillBlank' && <WrittenCard {...(props as QProps<FillBlankQuestion>)} />}
      {q.type === 'ordering' && <OrderingCard {...(props as QProps<OrderingQuestion>)} />}
      {q.type === 'multiSelect' && <MultiSelectCard {...(props as QProps<MultiSelectQuestion>)} />}
      {q.type === 'flashcard' && null}
    </section>
  )
}

function Prompt({ side, text, image, lang }: { side: 'term' | 'definition'; text: string; image?: string; lang?: string }) {
  const { t } = useTranslation('study')
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        {t(`common:common.${side}`)} <SpeakButton text={text} lang={lang} size={14} />
      </div>
      <CardFace text={text} image={image} className="mt-2 items-start text-left" textClassName="text-lg" />
    </div>
  )
}

function langFor(set: StudySet, side: 'term' | 'definition') {
  return side === 'term' ? set.lang.term : set.lang.definition
}

function TrueFalseCard({ q, state, set, onRespond }: QProps<TrueFalseQuestion>) {
  const { t } = useTranslation('study')
  const r = state.responses[q.id]
  const value = r?.type === 'trueFalse' ? r.value : null
  const res = state.results[q.id]
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:divide-x sm:divide-border">
        <Prompt side={q.promptSide} text={q.prompt} image={q.promptImage} lang={langFor(set, q.promptSide)} />
        <div className="sm:pl-4"><Prompt side={q.answerSide} text={q.shown} image={q.shownImage} lang={langFor(set, q.answerSide)} /></div>
      </div>
      <div className="mt-5 text-xs text-muted">{t('test.chooseAnswer')}</div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            disabled={state.submitted}
            onClick={() => onRespond(q.id, { type: 'trueFalse', value: v })}
            className={cn('rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition', value === v ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2', res && q.isTrue === v && 'border-accent bg-accent-soft/40', res && value === v && q.isTrue !== v && 'border-error bg-error-soft/40')}
          >
            {t(v ? 'test.true' : 'test.false')}
          </button>
        ))}
      </div>
      {res && !res.correct && <p className="mt-3 text-sm text-muted">{t('feedback.correctAnswer')}: <span className="font-semibold text-text">{q.answer}</span></p>}
    </div>
  )
}

function McCard({ q, state, set, onRespond }: QProps<MultipleChoiceQuestion>) {
  const { t } = useTranslation('study')
  const r = state.responses[q.id]
  const idx = r?.type === 'multipleChoice' ? r.index : null
  const res = state.results[q.id]
  return (
    <div>
      <Prompt side={q.promptSide} text={q.prompt} image={q.promptImage} lang={langFor(set, q.promptSide)} />
      <div className="mt-5 text-xs text-muted">{t('learn.chooseAnswer')}</div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <button
            key={i}
            disabled={state.submitted}
            onClick={() => onRespond(q.id, { type: 'multipleChoice', index: i })}
            className={cn('flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition', idx === i ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2', res && i === q.correctIndex && 'border-accent bg-accent-soft/40', res && idx === i && i !== q.correctIndex && 'border-error bg-error-soft/40')}
          >
            <CardFace text={o.text} image={o.image} className="items-start text-left" imgClassName="max-h-24" />
          </button>
        ))}
      </div>
      {!state.submitted && <button className="mt-3 text-sm font-semibold text-primary hover:underline" onClick={() => onRespond(q.id, { type: 'multipleChoice', index: -1 })}>{t('learn.dontKnow')}</button>}
    </div>
  )
}

function MatchingCard({ q, state, set, onRespond }: QProps<MatchingQuestion>) {
  const { t } = useTranslation('study')
  const r = state.responses[q.id]
  const slots = r?.type === 'matching' ? r.slots : q.pairs.map(() => null)
  const [active, setActive] = useState<number | null>(null)
  const res = state.results[q.id]
  const used = new Set(slots.filter((s): s is string => !!s))
  const textOf = (id: string | null) => q.options.find((o) => o.cardId === id)
  const assign = (slot: number, cardId: string | null) => {
    const next = slots.map((s, i) => (i === slot ? cardId : s === cardId ? null : s))
    onRespond(q.id, { type: 'matching', slots: next })
  }
  return (
    <div>
      <div className="text-sm font-semibold">{t('test.matchingInstruction', { answer: t(`common:common.${q.answerSide}`).toLowerCase(), prompt: t(`common:common.${q.promptSide}`).toLowerCase() })}</div>
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        {q.pairs.map((p, i) => {
          const filled = textOf(slots[i])
          const ok = res ? res.perCard[i]?.correct : undefined
          return (
            <div key={p.cardId} className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-center">
              <button
                disabled={state.submitted}
                onClick={() => (filled && active === null ? assign(i, null) : setActive(active === i ? null : i))}
                className={cn('min-h-14 rounded-xl border-2 border-dashed px-3 py-2 text-left text-sm transition', active === i ? 'border-primary bg-primary-soft' : 'border-border', filled && 'border-solid bg-surface-2/60', ok === true && 'border-accent bg-accent-soft/40', ok === false && 'border-error bg-error-soft/40')}
              >
                {filled ? <CardFace text={filled.text} image={filled.image} className="items-start text-left" imgClassName="max-h-16" /> : <span className="italic text-primary">{active === i ? t('test.selectBelow') : t('test.clickToSelect')}</span>}
              </button>
              <div>
                <CardFace text={p.left} image={p.leftImage} className="items-start text-left" textClassName="text-sm" imgClassName="max-h-16" />
                {ok === false && <div className="mt-1 text-xs text-accent">{p.right}</div>}
              </div>
            </div>
          )
        })}
      </div>
      {!state.submitted && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {q.options.map((o) => (
            <button
              key={o.cardId}
              disabled={used.has(o.cardId)}
              onClick={() => {
                if (active !== null) {
                  assign(active, o.cardId)
                  setActive(null)
                } else {
                  const free = slots.findIndex((s) => s === null)
                  if (free >= 0) assign(free, o.cardId)
                }
              }}
              className={cn('rounded-full border border-border px-3 py-1.5 text-sm transition hover:border-primary hover:bg-primary-soft disabled:opacity-30')}
            >
              <CardFace text={o.text} image={o.image} className="flex-row gap-2 text-left" imgClassName="max-h-8" />
            </button>
          ))}
        </div>
      )}
      <span className="sr-only">{set.title}</span>
    </div>
  )
}

function WrittenCard({ q, state, set, onRespond, onNext }: QProps<WrittenQuestion | FillBlankQuestion>) {
  const { t } = useTranslation('study')
  const r = state.responses[q.id]
  const text = r?.type === 'written' || r?.type === 'fillBlank' ? r.text : ''
  const res = state.results[q.id]
  return (
    <div>
      {q.type === 'fillBlank' ? (
        <div>
          <div className="text-xs font-semibold text-muted">{t('test.types.fillBlank')}</div>
          <CardFace text={q.prompt} className="mt-2 items-start text-left" textClassName="text-lg" />
        </div>
      ) : (
        <Prompt side={q.promptSide} text={q.prompt} image={q.promptImage} lang={langFor(set, q.promptSide)} />
      )}
      <div className="mt-5">
        <div className="mb-1 text-xs font-semibold text-muted">{t('learn.yourAnswer')}</div>
        {res ? (
          res.correct ? (
            <div className="rounded-xl border border-accent bg-accent-soft/40 px-4 py-3 text-sm">{text}</div>
          ) : (
            <AnswerDiff given={text} expected={q.answer} />
          )
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              onNext()
            }}
          >
            <Input value={text} onChange={(e) => onRespond(q.id, q.type === 'fillBlank' ? { type: 'fillBlank', text: e.target.value } : { type: 'written', text: e.target.value })} placeholder={t('learn.typeAnswer')} autoComplete="off" autoCapitalize="off" spellCheck={false} />
            <Button type="submit" variant="secondary">{t('common:common.next')}</Button>
          </form>
        )}
      </div>
    </div>
  )
}

function OrderingCard({ q, state, onRespond }: QProps<OrderingQuestion>) {
  const { t } = useTranslation('study')
  const r = state.responses[q.id]
  const order = r?.type === 'ordering' ? r.order : q.items.map((i) => i.cardId)
  const res = state.results[q.id]
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= order.length) return
    const next = order.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onRespond(q.id, { type: 'ordering', order: next })
  }
  return (
    <div>
      <div className="text-sm font-semibold">{t('test.orderingInstruction')}</div>
      <ol className="mt-4 space-y-2">
        {order.map((id, i) => {
          const item = q.items.find((it) => it.cardId === id)
          const ok = res ? q.correctOrder[i] === id : undefined
          return (
            <li key={id} className={cn('flex items-center gap-3 rounded-xl border-2 px-3 py-2 text-sm', ok === true ? 'border-accent bg-accent-soft/40' : ok === false ? 'border-error bg-error-soft/40' : 'border-border')}>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-2 text-xs font-bold">{i + 1}</span>
              <span className="flex-1">{item?.text}</span>
              {!state.submitted && (
                <span className="flex gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('test.moveUp')} className="rounded-md p-1 hover:bg-surface-2 disabled:opacity-30"><ArrowUp size={16} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={t('test.moveDown')} className="rounded-md p-1 hover:bg-surface-2 disabled:opacity-30"><ArrowDown size={16} /></button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      {res && !res.correct && <p className="mt-3 text-sm text-muted">{t('feedback.correctAnswer')}: <span className="font-semibold text-text">{res.expected}</span></p>}
    </div>
  )
}

function MultiSelectCard({ q, state, onRespond }: QProps<MultiSelectQuestion>) {
  const { t } = useTranslation('study')
  const r = state.responses[q.id]
  const selected = new Set(r?.type === 'multiSelect' ? r.selected : [])
  const res = state.results[q.id]
  const toggle = (i: number) => {
    const next = new Set(selected)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onRespond(q.id, { type: 'multiSelect', selected: [...next].sort((a, b) => a - b) })
  }
  return (
    <div>
      <div className="text-sm font-semibold">{t('test.multiSelectInstruction', { side: t(`common:common.${q.answerSide}`).toLowerCase() })}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-base">
        {q.prompts.map((p, i) => (
          <li key={i}><CardFace text={p} className="inline-flex items-start text-left" /></li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <label key={i} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2 text-sm', selected.has(i) ? 'border-primary bg-primary-soft' : 'border-border', res && o.correct && 'border-accent bg-accent-soft/40', res && selected.has(i) && !o.correct && 'border-error bg-error-soft/40')}>
            <input type="checkbox" className="mt-1 accent-primary" checked={selected.has(i)} disabled={state.submitted} onChange={() => toggle(i)} />
            <CardFace text={o.text} image={o.image} className="items-start text-left" imgClassName="max-h-16" />
          </label>
        ))}
      </div>
    </div>
  )
}
