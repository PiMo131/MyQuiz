import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Pencil, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { finishSession, recordOutcome, startSession } from '@/db/repo'
import type { GradingStrictness, Session, SessionAnswer } from '@/domain/types'
import { gradeAnswer } from '@/domain/grading'
import type { AnswerWith } from '@/domain/question-generator'
import { useSettings } from '@/app/settings-store'
import { Button, Input, Modal, Select, Toggle, cn } from '@/ui'
import { StudyHeader } from '../shared/StudyHeader'
import { useSetData } from '../shared/useSetData'
import { CardFace } from '../shared/CardFace'
import { SpeakButton } from '../shared/SpeakButton'
import { AnswerDiff } from '../shared/AnswerDiff'
import { useAnyKey } from '../shared/useKeys'
import { usePref } from '../shared/usePref'
import { sfx } from '../shared/sounds'
import { celebrate } from '../shared/confetti'
import { endStudy } from '../shared/session-end'
import { StatBars } from './StatBars'
import { answerWrite, createWrite, nextWrite, overrideCorrect, remaining, type WriteState } from './engine'

interface WriteOptions {
  answerWith: AnswerWith
  strictness: GradingStrictness
  retype: boolean
  starredOnly: boolean
  shuffle: boolean
}

export default function WritePage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation('study')
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const { set, cards, loading } = useSetData(setId)
  const [stored, setStored] = usePref<Partial<WriteOptions>>('write.options', {})
  const opts: WriteOptions = useMemo(() => ({ answerWith: 'definition', strictness: settings.grading.strictness, retype: false, starredOnly: false, shuffle: true, ...stored }), [stored, settings.grading.strictness])

  const [state, setState] = useState<WriteState | null>(null)
  const [typed, setTyped] = useState('')
  const [retyped, setRetyped] = useState('')
  const [feedback, setFeedback] = useState<{ correct: boolean; given: string } | null>(null)
  const [options, setOptions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dbSession = useRef<Session | null>(null)
  const answers = useRef<SessionAnswer[]>([])
  const shownAt = useRef(0)
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])

  const begin = useCallback(
    (o: WriteOptions) => {
      const s0 = createWrite(cards, { starredOnly: o.starredOnly, shuffle: o.shuffle, seed: Date.now() % 100000 })
      setState(nextWrite(s0, cards, o.answerWith))
      setFeedback(null)
      setTyped('')
      setRetyped('')
      answers.current = []
      shownAt.current = Date.now()
      void startSession(setId, 'write', { answerWith: o.answerWith, strictness: o.strictness }).then((s) => (dbSession.current = s))
    },
    [cards, setId],
  )

  const started = useRef(false)
  useEffect(() => {
    if (started.current || loading || !cards.length) return
    started.current = true
    begin(opts)
  }, [loading, cards.length, begin, opts])

  const q = state?.current ?? null
  const card = q ? byId.get(q.cardId) : undefined

  const submit = (text: string) => {
    if (!state || !q || !card || feedback) return
    const g = text.trim() ? gradeAnswer(text, q.accepted, { ...settings.grading, strictness: opts.strictness }) : { correct: false }
    setFeedback({ correct: g.correct, given: text })
    if (settings.sounds) (g.correct ? sfx.correct : sfx.wrong)()
    void recordOutcome(card, g.correct, 'write', q.variant, Date.now() - shownAt.current)
    answers.current.push({ cardId: card.id, questionType: 'written', prompt: q.prompt, given: text, expected: q.answer, correct: g.correct, durationMs: Date.now() - shownAt.current })
  }

  const next = useCallback(() => {
    if (!state || !feedback) return
    const s = answerWrite(state, feedback.correct)
    setState(nextWrite(s, cards, opts.answerWith))
    setFeedback(null)
    setTyped('')
    setRetyped('')
    shownAt.current = Date.now()
  }, [state, feedback, cards, opts.answerWith])

  useEffect(() => {
    if (!feedback?.correct) return
    const id = setTimeout(next, 700)
    return () => clearTimeout(id)
  }, [feedback, next])

  useEffect(() => {
    if (!feedback && q) inputRef.current?.focus()
  }, [feedback, q])

  const done = !!state?.done
  useEffect(() => {
    if (!done || !state) return
    if (settings.sounds) sfx.done()
    void celebrate()
    const s = dbSession.current
    if (s) {
      dbSession.current = null
      void finishSession(s, { answers: answers.current, total: state.total, score: answers.current.length ? answers.current.filter((a) => a.correct).length / answers.current.length : undefined })
    }
    void endStudy(setId)
  }, [done, state, settings.sounds, setId])

  const needsRetype = !!feedback && !feedback.correct && opts.retype
  const retypeOk = needsRetype && q ? gradeAnswer(retyped, q.accepted, { strictness: 'moderate' }).correct : true
  useAnyKey(feedback && !feedback.correct && !needsRetype ? next : null, { enabled: !options })

  if (loading || !set) return null

  const promptLang = q ? (q.promptSide === 'term' ? set.lang.term : set.lang.definition) : undefined

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StudyHeader mode="write" setId={setId} title={set.title} counter={state ? `${state.correct} / ${state.total}` : undefined} onSettings={() => setOptions(true)} />
      <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-6 px-4 pb-8 md:grid-cols-[14rem_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <div className="mb-4 flex items-center gap-2 text-lg font-bold"><Pencil size={20} className="text-primary" /> {t('common:modes.write')}</div>
          {state && <StatBars remaining={remaining(state)} incorrect={state.incorrect} correct={state.correct} total={state.total} />}
          {state && state.round > 1 && <div className="mt-3 text-xs text-muted">{t('write.round', { round: state.round })}</div>}
          <Button variant="secondary" size="sm" className="mt-4 w-full" leftIcon={<SlidersHorizontal size={16} />} onClick={() => setOptions(true)}>{t('common:common.options')}</Button>
        </aside>

        <section>
          {done && state ? (
            <div className="card p-6 text-center">
              <h2 className="text-2xl font-bold">{t('write.doneTitle')}</h2>
              <p className="mt-1 text-sm text-muted">{t('write.doneBody', { correct: state.correct, incorrect: state.incorrect, rounds: state.round })}</p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button leftIcon={<RotateCcw size={16} />} onClick={() => begin(opts)}>{t('common:common.restart')}</Button>
                <Button variant="secondary" onClick={() => navigate(`/set/${setId}`)}>{t('study.backToSet')}</Button>
              </div>
            </div>
          ) : q && card ? (
            feedback && !feedback.correct ? (
              <div className="card p-6">
                <h2 className="flex items-center gap-2 text-2xl font-bold text-error"><span aria-hidden>😕</span> {t('write.studyThisOne')}</h2>
                <div className="mt-5 rounded-xl bg-surface-2/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                    {t(`common:common.${q.promptSide}`)}
                    <SpeakButton text={q.prompt} lang={promptLang} size={14} />
                  </div>
                  <CardFace text={q.prompt} image={q.promptImage} className="mt-1 items-start text-left" />
                </div>
                <AnswerDiff
                  className="mt-5"
                  given={feedback.given}
                  expected={q.answer}
                  onOverride={() => {
                    if (!state) return
                    setFeedback({ ...feedback, correct: true })
                    setState(overrideCorrect(state, q.cardId))
                    void recordOutcome(card, true, 'write', q.variant)
                  }}
                />
                {needsRetype ? (
                  <form className="mt-5" onSubmit={(e) => { e.preventDefault(); if (retypeOk) next() }}>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{t('feedback.retype')}</div>
                    <div className="flex gap-2">
                      <Input autoFocus value={retyped} onChange={(e) => setRetyped(e.target.value)} className={cn(retypeOk && 'border-accent')} autoComplete="off" spellCheck={false} />
                      <Button type="submit" disabled={!retypeOk}>{t('common:common.continue')}</Button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-6 flex justify-center">
                    <Button onClick={next}>{t('feedback.pressAnyKey')}</Button>
                  </div>
                )}
              </div>
            ) : (
              <form
                className={cn('card p-6 transition', feedback?.correct && 'border-accent ring-2 ring-accent/30')}
                onSubmit={(e) => {
                  e.preventDefault()
                  submit(typed)
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                      {t(`common:common.${q.promptSide}`)}
                      <SpeakButton text={q.prompt} lang={promptLang} size={14} />
                    </div>
                    <CardFace text={q.prompt} image={q.promptImage} className="mt-2 items-start text-left" textClassName="text-lg sm:text-xl" />
                  </div>
                  <button type="button" className="shrink-0 text-sm font-semibold text-secondary hover:underline" onClick={() => submit('')} disabled={!!feedback}>{t('common:common.dontKnow')}</button>
                </div>
                <div className="mt-6 border-t border-border pt-5">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={!!feedback} className="rounded-none border-0 border-b-2 border-highlight bg-transparent px-0 text-base focus:ring-0" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label={t('write.typeAnswer')} />
                      <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-muted">{t('write.typeAnswer')}</div>
                    </div>
                    <Button type="submit" disabled={!typed.trim() || !!feedback}>{t('learn.answer')}</Button>
                  </div>
                  {feedback?.correct && <div className="mt-3 text-sm font-semibold text-accent">{t('feedback.correct')}</div>}
                </div>
              </form>
            )
          ) : (
            <div className="card p-6 text-center text-muted">{opts.starredOnly ? t('flashcards.noStarred') : t('set.noCards')}</div>
          )}
        </section>
      </main>

      <Modal open={options} onClose={() => setOptions(false)} title={t('common:common.options')} footer={<Button onClick={() => { setOptions(false); begin(opts) }}>{t('write.applyRestart')}</Button>}>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="text-sm font-medium">{t('learn.answerWith')}</div>
            <Select value={opts.answerWith} onChange={(e) => setStored({ ...stored, answerWith: e.target.value as AnswerWith })} className="w-40">
              <option value="term">{t('common:common.term')}</option>
              <option value="definition">{t('common:common.definition')}</option>
              <option value="both">{t('common:common.both')}</option>
            </Select>
          </div>
          <div className="py-3">
            <div className="mb-1 text-sm font-medium">{t('learn.gradingOptions')}</div>
            {(['relaxed', 'moderate', 'strict'] as GradingStrictness[]).map((s) => (
              <label key={s} className="flex cursor-pointer items-start justify-between gap-4 py-1.5">
                <div>
                  <div className="text-sm">{t(`grading.${s}.title`)}</div>
                  <div className="text-xs text-muted">{t(`grading.${s}.body`)}</div>
                </div>
                <input type="radio" name="w-strictness" className="mt-1 accent-primary" checked={opts.strictness === s} onChange={() => setStored({ ...stored, strictness: s })} />
              </label>
            ))}
          </div>
          <Toggle checked={opts.retype} onChange={(v) => setStored({ ...stored, retype: v })} label={t('grading.retype')} description={t('grading.retypeHint')} />
          <Toggle checked={opts.starredOnly} onChange={(v) => setStored({ ...stored, starredOnly: v })} label={t('flashcards.starredOnly')} />
          <Toggle checked={opts.shuffle} onChange={(v) => setStored({ ...stored, shuffle: v })} label={t('common:common.shuffle')} />
        </div>
      </Modal>
    </div>
  )
}
