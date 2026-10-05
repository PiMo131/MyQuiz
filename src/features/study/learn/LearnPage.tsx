import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { ArrowRight, Check, ChevronDown, ChevronRight, Flag, Image as ImageIcon, List, Pencil, RotateCcw, Shuffle, Star, Volume2, X, Layers } from 'lucide-react'
import { finishSession, recordOutcome, startSession } from '@/db/repo'
import type { Card, GradingStrictness, Session, SessionAnswer } from '@/domain/types'
import { gradeAnswer } from '@/domain/grading'
import type { MultipleChoiceQuestion, WrittenQuestion } from '@/domain/question-generator'
import { useSettings } from '@/app/settings-store'
import { Button, Input, Kbd, Modal, ProgressBar, Toggle, cn } from '@/ui'
import { ExplainButton } from '@/features/ai'
import { speak } from '@/features/tts'
import { StudyHeader } from '../shared/StudyHeader'
import { useSetData } from '../shared/useSetData'
import { CardFace } from '../shared/CardFace'
import { FlipCard } from '../shared/FlipCard'
import { SpeakButton } from '../shared/SpeakButton'
import { AnswerDiff } from '../shared/AnswerDiff'
import { useAnyKey, useKeys } from '../shared/useKeys'
import { usePref } from '../shared/usePref'
import { sfx } from '../shared/sounds'
import { celebrate } from '../shared/confetti'
import { endStudy } from '../shared/session-end'
import {
  DEFAULT_LEARN_CONFIG, answerCurrent, createLearn, learnProgress, masteredCount, nextQuestion, reconfigure, roundFinished,
  type LearnConfig, type LearnGoal, type LearnQuestionType, type LearnState,
} from './engine'

type Phase = 'question' | 'feedback' | 'round' | 'done'
interface Feedback {
  correct: boolean
  given: string
  chosen?: number
}

export default function LearnPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation('study')
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const { set, cards, loading } = useSetData(setId)

  const [stored, setStored] = usePref<Partial<LearnConfig>>('learn.config', {})
  const config: LearnConfig = useMemo(() => ({ ...DEFAULT_LEARN_CONFIG, strictness: settings.grading.strictness, sounds: settings.sounds, ...stored }), [stored, settings.grading.strictness, settings.sounds])
  const [goalOpen, setGoalOpen] = useState(true)
  const [goal, setGoal] = useState<LearnGoal>(config.goal)
  const [state, setState] = useState<LearnState | null>(null)
  const [phase, setPhase] = useState<Phase>('question')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [typed, setTyped] = useState('')
  const [retyped, setRetyped] = useState('')
  const [flipped, setFlipped] = useState(false)
  const [tally, setTally] = useState({ correct: 0, wrong: 0 })
  const [quick, setQuick] = useState(false)
  const [options, setOptions] = useState(false)
  const dbSession = useRef<Session | null>(null)
  const answers = useRef<SessionAnswer[]>([])
  const shownAt = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])

  const q = state?.current ?? null
  const card: Card | undefined = q && 'cardId' in q ? byId.get(q.cardId) : undefined
  const progress = state ? learnProgress(state) : { done: 0, total: 0 }

  const advance = useCallback(
    (s: LearnState) => {
      setFeedback(null)
      setTyped('')
      setRetyped('')
      setFlipped(false)
      if (s.done) {
        setState(s)
        setPhase('done')
        return
      }
      if (roundFinished(s)) {
        setState(s)
        setPhase('round')
        return
      }
      setState(nextQuestion(s, cards))
      setPhase('question')
      shownAt.current = Date.now()
    },
    [cards],
  )

  const start = async (cfg: LearnConfig) => {
    setGoalOpen(false)
    setStored({ ...stored, goal: cfg.goal })
    const s = createLearn(cards, cfg)
    advance(s)
    answers.current = []
    setTally({ correct: 0, wrong: 0 })
    dbSession.current = await startSession(setId, 'learn', { goal: cfg.goal, answerWith: cfg.answerWith })
  }

  const finish = useCallback(
    (correct: boolean, given: string, chosen?: number) => {
      if (!state || !q || !card || phase !== 'question') return
      setFeedback({ correct, given, chosen })
      setPhase('feedback')
      setTally((x) => ({ correct: x.correct + (correct ? 1 : 0), wrong: x.wrong + (correct ? 0 : 1) }))
      if (config.sounds) (correct ? sfx.correct : sfx.wrong)()
      void recordOutcome(card, correct, 'learn', 'variant' in q ? q.variant : 'forward', Date.now() - shownAt.current)
      answers.current.push({ cardId: card.id, questionType: q.type, prompt: 'prompt' in q ? q.prompt : '', given, expected: 'answer' in q ? q.answer : '', correct, durationMs: Date.now() - shownAt.current })
    },
    [state, q, card, phase, config.sounds],
  )

  const next = useCallback(() => {
    if (!state || !feedback) return
    advance(answerCurrent(state, feedback.correct))
  }, [state, feedback, advance])

  // Correct answers continue automatically.
  useEffect(() => {
    if (phase !== 'feedback' || !feedback?.correct) return
    const id = setTimeout(next, 900)
    return () => clearTimeout(id)
  }, [phase, feedback, next])

  // Finished -> confetti + close the session.
  useEffect(() => {
    if (phase !== 'done' || !state) return
    if (config.sounds) sfx.done()
    void celebrate()
    const s = dbSession.current
    if (s) {
      dbSession.current = null
      const total = answers.current.length
      void finishSession(s, { answers: answers.current, total, score: total ? answers.current.filter((a) => a.correct).length / total : undefined })
    }
    void endStudy(setId)
  }, [phase, state, config.sounds, setId])

  // TTS prompt
  useEffect(() => {
    if (!config.tts || !q || phase !== 'question' || !('prompt' in q) || !set) return
    speak(q.prompt, q.promptSide === 'term' ? set.lang.term : set.lang.definition, { rate: settings.tts.rate })
    // eslint-disable-next-line
  }, [q?.id, phase, config.tts])

  useEffect(() => {
    if (phase === 'question' && q?.type === 'written') inputRef.current?.focus()
  }, [phase, q])

  const needsRetype = phase === 'feedback' && feedback && !feedback.correct && q?.type === 'written' && config.retype
  const retypeOk = needsRetype && q?.type === 'written' ? gradeAnswer(retyped, q.accepted, { strictness: 'moderate' }).correct : true

  useKeys(
    {
      '1': () => q?.type === 'multipleChoice' && pick(0),
      '2': () => q?.type === 'multipleChoice' && pick(1),
      '3': () => q?.type === 'multipleChoice' && pick(2),
      '4': () => q?.type === 'multipleChoice' && pick(3),
      ' ': () => q?.type === 'flashcard' && setFlipped((f) => !f),
    },
    { enabled: phase === 'question' && !goalOpen && !options && !quick },
  )
  useAnyKey(phase === 'feedback' && feedback && !feedback.correct && !needsRetype ? next : null, { enabled: !options && !quick })

  const pick = (i: number) => {
    if (q?.type !== 'multipleChoice' || !q.options[i]) return
    finish(i === q.correctIndex, q.options[i].text, i)
  }
  const submitWritten = () => {
    if (q?.type !== 'written') return
    const g = gradeAnswer(typed, q.accepted, { ...settings.grading, strictness: config.strictness })
    finish(g.correct, typed)
  }

  if (loading || !set) return null
  const segments = Math.min(8, Math.max(1, Math.ceil(Object.keys(state?.cards ?? {}).length / config.roundSize)))

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StudyHeader
        mode="learn"
        setId={setId}
        title={set.title}
        counter={state ? `${progress.done} / ${progress.total}` : undefined}
        onSettings={() => setQuick((v) => !v)}
        sound={config.sounds}
        onToggleSound={() => setStored({ ...stored, sounds: !config.sounds })}
      />

      {quick && (
        <QuickSettings
          config={config}
          onChange={(patch) => {
            const cfg = { ...config, ...patch }
            setStored({ ...stored, ...patch })
            if (state) advance(reconfigure(state, cfg))
          }}
          onAll={() => {
            setQuick(false)
            setOptions(true)
          }}
          onClose={() => setQuick(false)}
        />
      )}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-28">
        {state && phase !== 'done' && (
          <div className="mb-5 flex items-center gap-3">
            <span className={cn('grid h-8 min-w-8 place-items-center rounded-full px-2 text-sm font-bold text-white', progress.done ? 'bg-accent' : 'bg-surface-2 text-text')}>{progress.done}</span>
            <ProgressBar value={progress.done} max={Math.max(1, progress.total)} tone="accent" segments={segments} className="h-3" />
            <span className="grid h-8 min-w-8 place-items-center rounded-full bg-surface-2 px-2 text-sm font-bold">{progress.total}</span>
          </div>
        )}

        {phase === 'done' && state ? (
          <Summary
            title={t('learn.doneTitle')}
            body={t('learn.doneBody', { count: masteredCount(state) })}
            stats={[
              [t('learn.rounds'), state.roundNumber],
              [t('common:common.correct'), tally.correct],
              [t('common:common.incorrect'), tally.wrong],
            ]}
            actions={
              <>
                <Button onClick={() => navigate(`/set/${setId}`)}>{t('study.backToSet')}</Button>
                <Button variant="secondary" leftIcon={<RotateCcw size={16} />} onClick={() => void start(config)}>{t('learn.restart')}</Button>
                <Button variant="ghost" onClick={() => navigate(`/set/${setId}/test`)}>{t('learn.takeTest')}</Button>
              </>
            }
          />
        ) : phase === 'round' && state ? (
          <Summary
            title={t('learn.roundTitle', { round: state.roundNumber })}
            body={t('learn.roundBody', { mastered: masteredCount(state), total: Object.keys(state.cards).length })}
            stats={[
              [t('common:common.correct'), state.roundCorrect],
              [t('common:common.incorrect'), state.roundWrong],
              [t('learn.remaining'), state.queue.length],
            ]}
            actions={<Button size="lg" rightIcon={<ArrowRight size={16} />} onClick={() => advance({ ...state, round: [] })}>{t('learn.nextRound')}</Button>}
          />
        ) : q && card ? (
          <div className="card p-5 sm:p-7">
            {'prompt' in q && (
              <>
                <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                  {t(`common:common.${q.promptSide}`)}
                  <SpeakButton text={q.prompt} lang={q.promptSide === 'term' ? set.lang.term : set.lang.definition} size={14} />
                </div>
                <div className="mt-3 min-h-16">
                  <CardFace text={q.prompt} image={q.promptImage} className="items-start text-left" textClassName="text-lg sm:text-xl" />
                </div>
              </>
            )}

            {q.type === 'multipleChoice' && <McOptions q={q} feedback={feedback} onPick={pick} onContinue={next} />}

            {q.type === 'written' && (
              <WrittenBlock
                q={q}
                typed={typed}
                setTyped={setTyped}
                feedback={feedback}
                onSubmit={submitWritten}
                onDontKnow={() => finish(false, '')}
                inputRef={inputRef}
                retype={needsRetype ? { value: retyped, set: setRetyped, ok: !!retypeOk } : null}
                onOverride={() => {
                  if (!feedback) return
                  setFeedback({ ...feedback, correct: true })
                  if (card) void recordOutcome(card, true, 'learn', q.variant)
                }}
              />
            )}

            {q.type === 'flashcard' && (
              <div className="mt-4">
                <FlipCard flipped={flipped} onFlip={() => setFlipped((f) => !f)} className="h-64" front={<CardFace text={q.prompt} textClassName="text-xl" />} back={<CardFace text={q.answer} textClassName="text-xl" />} />
                {!feedback && (
                  <div className="mt-4 flex justify-center gap-3">
                    <Button variant="outline" leftIcon={<X size={16} />} onClick={() => finish(false, '')}>{t('flashcards.stillLearning')}</Button>
                    <Button leftIcon={<Check size={16} />} onClick={() => finish(true, q.answer)}>{t('flashcards.know')}</Button>
                  </div>
                )}
              </div>
            )}

            {q.type !== 'flashcard' && phase === 'question' && (
              <div className="mt-4 flex items-center justify-end gap-3 text-sm">
                <button className="rounded-full p-1.5 text-muted hover:bg-surface-2" aria-label={t('learn.flag')} title={t('learn.flag')}><Flag size={16} /></button>
                <button className="font-semibold text-primary hover:underline" onClick={() => finish(false, '')}>{t('learn.dontKnow')}</button>
              </div>
            )}
          </div>
        ) : null}
      </main>

      {/* Feedback bar */}
      {phase === 'feedback' && feedback && !feedback.correct && card && q && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur safe-bottom">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted">{needsRetype ? t('learn.retypeHint') : q.type === 'multipleChoice' ? t('learn.clickCorrect') : t('feedback.pressAnyKey')}</span>
            <div className="flex items-center gap-2">
              <ExplainButton card={card} givenAnswer={feedback.given} questionType={q.type} />
              <Button onClick={next} disabled={!retypeOk}>{t('common:common.continue')}</Button>
            </div>
          </div>
        </div>
      )}
      {phase === 'feedback' && feedback?.correct && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-accent/40 bg-accent-soft px-4 py-3 text-center text-sm font-semibold text-accent safe-bottom">{t('feedback.correct')}</div>
      )}

      {/* Goal modal */}
      <Modal
        open={goalOpen}
        onClose={() => navigate(`/set/${setId}`)}
        title={
          <div>
            <div className="text-sm font-medium text-muted">{set.title}</div>
            {t('learn.goalTitle')}
          </div>
        }
        size="lg"
        footer={<Button onClick={() => void start({ ...config, goal })} rightIcon={<ArrowRight size={16} />}>{t('learn.start')}</Button>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(['cram', 'memorize'] as LearnGoal[]).map((g) => (
            <button key={g} onClick={() => setGoal(g)} className={cn('flex items-center justify-between rounded-2xl border-2 p-4 text-left font-semibold transition', goal === g ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/40')}>
              <div>
                <div>{t(`learn.goal.${g}.title`)}</div>
                <div className="mt-0.5 text-xs font-normal text-muted">{t(`learn.goal.${g}.body`)}</div>
              </div>
              <span className="text-2xl">{g === 'cram' ? '⏱️' : '🧠'}</span>
            </button>
          ))}
        </div>
      </Modal>

      <LearnOptions
        key={String(options)}
        open={options}
        config={config}
        setId={setId}
        hasCloze={false}
        onClose={() => setOptions(false)}
        onSave={(cfg) => {
          setStored({ ...stored, ...cfg })
          setOptions(false)
          if (state) advance(reconfigure(state, cfg))
        }}
        onRestart={() => {
          setOptions(false)
          void start(config)
        }}
      />
    </div>
  )
}

// ---------- pieces ----------

function McOptions({ q, feedback, onPick, onContinue }: { q: MultipleChoiceQuestion; feedback: Feedback | null; onPick: (i: number) => void; onContinue: () => void }) {
  const { t } = useTranslation('study')
  const wrong = feedback && !feedback.correct
  return (
    <div className="mt-6">
      <div className={cn('mb-2 text-sm font-semibold', wrong ? 'text-highlight' : 'text-muted')}>{wrong ? t('feedback.noSweat') : t('learn.chooseAnswer')}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {q.options.map((o, i) => {
          const isCorrect = i === q.correctIndex
          const isChosen = feedback?.chosen === i
          const state = !feedback ? 'idle' : isCorrect ? 'correct' : isChosen ? 'wrong' : 'dim'
          return (
            <button
              key={i}
              disabled={!!feedback && !(wrong && isCorrect)}
              onClick={() => (feedback ? onContinue() : onPick(i))}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition',
                state === 'idle' && 'border-border hover:border-primary/60 hover:bg-surface-2',
                state === 'correct' && 'border-dashed border-accent bg-accent-soft/40',
                state === 'wrong' && 'border-highlight bg-highlight-soft/40 animate-shake',
                state === 'dim' && 'border-border opacity-50',
              )}
            >
              <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold', state === 'correct' ? 'text-accent' : state === 'wrong' ? 'text-highlight' : 'bg-surface-2 text-muted')}>
                {state === 'correct' ? <Check size={16} /> : state === 'wrong' ? <X size={16} /> : i + 1}
              </span>
              <CardFace text={o.text} image={o.image} className="items-start text-left" imgClassName="max-h-24" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WrittenBlock({ q, typed, setTyped, feedback, onSubmit, onDontKnow, inputRef, retype, onOverride }: {
  q: WrittenQuestion
  typed: string
  setTyped: (v: string) => void
  feedback: Feedback | null
  onSubmit: () => void
  onDontKnow: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  retype: { value: string; set: (v: string) => void; ok: boolean } | null
  onOverride: () => void
}) {
  const { t } = useTranslation('study')
  if (feedback && !feedback.correct) {
    return (
      <div className="mt-6">
        <div className="mb-3 text-sm font-semibold text-highlight">{t('feedback.noSweat')}</div>
        <AnswerDiff given={feedback.given} expected={q.answer} onOverride={onOverride} />
        {retype && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{t('feedback.retype')}</div>
            <Input autoFocus value={retype.value} onChange={(e) => retype.set(e.target.value)} className={cn(retype.ok && 'border-accent')} placeholder={q.answer} />
          </div>
        )}
      </div>
    )
  }
  return (
    <form
      className="mt-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (typed.trim()) onSubmit()
      }}
    >
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{t('learn.yourAnswer')}</div>
      <div className="flex gap-2">
        <Input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('learn.typeAnswer')} disabled={!!feedback} autoComplete="off" autoCapitalize="off" spellCheck={false} />
        <Button type="submit" disabled={!typed.trim() || !!feedback}>{t('learn.answer')}</Button>
      </div>
      {!feedback && <button type="button" className="mt-2 text-sm font-semibold text-primary hover:underline" onClick={onDontKnow}>{t('learn.dontKnow')}</button>}
    </form>
  )
}

function Summary({ title, body, stats, actions }: { title: string; body: string; stats: Array<[string, number]>; actions: React.ReactNode }) {
  return (
    <div className="card mx-auto mt-4 w-full max-w-xl p-6 text-center">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-2 p-3">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-2">{actions}</div>
    </div>
  )
}

const TYPE_ICON: Record<LearnQuestionType, React.ReactNode> = { multipleChoice: <List size={16} />, written: <Pencil size={16} />, flashcard: <Layers size={16} /> }

function QuickSettings({ config, onChange, onAll, onClose }: { config: LearnConfig; onChange: (patch: Partial<LearnConfig>) => void; onAll: () => void; onClose: () => void }) {
  const { t } = useTranslation('study')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const id = setTimeout(() => document.addEventListener('mousedown', onDoc), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const toggleType = (k: LearnQuestionType) => {
    const types = { ...config.types, [k]: !config.types[k] }
    if (!Object.values(types).some(Boolean)) return
    onChange({ types })
  }
  return (
    <div ref={ref} className="animate-pop absolute right-3 top-16 z-40 w-80 rounded-2xl border border-border bg-surface p-3 shadow-pop sm:right-5">
      <div className="grid grid-cols-3 gap-2">
        <QuickChip active={config.shuffle} onClick={() => onChange({ shuffle: !config.shuffle })} icon={<Shuffle size={18} />} label={t('common:common.shuffle')} />
        <QuickChip active={config.starredOnly} onClick={() => onChange({ starredOnly: !config.starredOnly })} icon={<Star size={18} />} label={t('learn.studyStarred')} />
        <QuickChip active={config.sounds} onClick={() => onChange({ sounds: !config.sounds })} icon={<Volume2 size={18} />} label={t('learn.soundEffects')} />
      </div>
      <div className="mt-3 rounded-xl bg-surface-2/60 p-3">
        <div className="mb-1 text-sm font-semibold">{t('learn.questionTypes')}</div>
        {(['multipleChoice', 'written', 'flashcard'] as LearnQuestionType[]).map((k) => (
          <div key={k} className="flex items-center justify-between py-1.5 text-sm">
            <span className="flex items-center gap-2">{TYPE_ICON[k]} {t(`learn.types.${k}`)}</span>
            <Toggle checked={config.types[k]} onChange={() => toggleType(k)} />
          </div>
        ))}
      </div>
      <button className="mt-3 w-full text-center text-sm font-semibold text-primary hover:underline" onClick={onAll}>{t('learn.viewAllOptions')}</button>
    </div>
  )
}

function QuickChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} aria-pressed={active} title={label} aria-label={label} className={cn('flex h-12 items-center justify-center rounded-xl border-2 transition', active ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted hover:bg-surface-2')}>
      {icon}
    </button>
  )
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-border">
      <button className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {title} <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-border px-4 py-1">{children}</div>}
    </div>
  )
}

export function LearnOptions({ open, config, setId, onClose, onSave, onRestart }: { open: boolean; config: LearnConfig; setId: string; hasCloze: boolean; onClose: () => void; onSave: (c: LearnConfig) => void; onRestart: () => void }) {
  const { t } = useTranslation('study')
  const navigate = useNavigate()
  const [draft, setDraft] = useState(config)
  const dirty = JSON.stringify(draft) !== JSON.stringify(config)
  const answerTerm = draft.answerWith === 'term' || draft.answerWith === 'both'
  const answerDef = draft.answerWith === 'definition' || draft.answerWith === 'both'
  const setAnswer = (term: boolean, def: boolean) => {
    if (!term && !def) return
    setDraft({ ...draft, answerWith: term && def ? 'both' : term ? 'term' : 'definition' })
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('common:common.options')}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button className="flex items-center gap-2 text-sm font-semibold text-error" onClick={onRestart}><RotateCcw size={16} /> {t('learn.restart')}</button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>{t('common:common.cancel')}</Button>
            <Button disabled={!dirty} onClick={() => onSave(draft)}>{t('common:common.save')}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {([
            ['shuffle', <Shuffle key="s" size={16} />, t('common:common.shuffle')],
            ['starredOnly', <Star key="t" size={16} />, t('learn.studyStarred')],
            ['sounds', <Volume2 key="v" size={16} />, t('learn.soundEffects')],
          ] as Array<[keyof LearnConfig, React.ReactNode, string]>).map(([k, icon, label]) => (
            <button key={k} onClick={() => setDraft({ ...draft, [k]: !draft[k] })} aria-pressed={!!draft[k]} className={cn('flex h-12 items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold transition', draft[k] ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted')}>
              {icon} <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        <Section title={t('learn.questionTypes')} defaultOpen>
          {(['multipleChoice', 'written', 'flashcard'] as LearnQuestionType[]).map((k) => (
            <Toggle key={k} checked={draft.types[k]} onChange={(v) => { const types = { ...draft.types, [k]: v }; if (Object.values(types).some(Boolean)) setDraft({ ...draft, types }) }} label={t(`learn.types.${k}`)} />
          ))}
        </Section>
        <Section title={t('learn.answerWith')}>
          <Toggle checked={answerTerm} onChange={(v) => setAnswer(v, answerDef)} label={t('common:common.term')} />
          <Toggle checked={answerDef} onChange={(v) => setAnswer(answerTerm, v)} label={t('common:common.definition')} />
        </Section>
        <Section title={t('learn.seeImagesWith')}>
          <Toggle checked={draft.images.questions} onChange={(v) => setDraft({ ...draft, images: { ...draft.images, questions: v } })} label={t('learn.images.questions')} />
          <Toggle checked={draft.images.choices} onChange={(v) => setDraft({ ...draft, images: { ...draft.images, choices: v } })} label={t('learn.images.choices')} />
          <div className="flex items-center gap-2 py-2 text-xs text-muted"><ImageIcon size={14} /> {t('learn.imagesHint')}</div>
        </Section>
        <Section title={t('learn.gradingOptions')}>
          {(['relaxed', 'moderate', 'strict'] as GradingStrictness[]).map((s) => (
            <label key={s} className="flex cursor-pointer items-start justify-between gap-4 py-2">
              <div>
                <div className="text-sm font-medium">{t(`grading.${s}.title`)}</div>
                <div className="text-xs text-muted">{t(`grading.${s}.body`)}</div>
              </div>
              <input type="radio" name="strictness" className="mt-1 accent-primary" checked={draft.strictness === s} onChange={() => setDraft({ ...draft, strictness: s })} />
            </label>
          ))}
          <div className="border-t border-border">
            <Toggle checked={draft.retype} onChange={(v) => setDraft({ ...draft, retype: v })} label={t('grading.retype')} description={t('grading.retypeHint')} />
          </div>
        </Section>
        <div className="rounded-xl border border-border px-4">
          <Toggle checked={draft.tts} onChange={(v) => setDraft({ ...draft, tts: v })} label={t('common:common.textToSpeech')} />
        </div>
        <div className="divide-y divide-border rounded-xl border border-border px-4">
          {(['write', 'spell'] as const).map((m) => (
            <button key={m} className="flex w-full items-center justify-between py-3 text-sm font-medium" onClick={() => navigate(`/set/${setId}/${m}`)}>
              {t(`common:modes.${m}`)} <span className="flex items-center gap-1 text-primary">{t('common:common.start')} <ChevronRight size={16} /></span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted"><Kbd>1</Kbd>–<Kbd>4</Kbd> {t('learn.keysHint')}</div>
      </div>
    </Modal>
  )
}
