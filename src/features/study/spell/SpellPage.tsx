import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { RotateCcw, SlidersHorizontal, SpellCheck, Turtle, Volume2 } from 'lucide-react'
import { finishSession, recordOutcome, startSession } from '@/db/repo'
import type { Session, SessionAnswer } from '@/domain/types'
import { gradeAnswer } from '@/domain/grading'
import type { AnswerWith } from '@/domain/question-generator'
import { useSettings } from '@/app/settings-store'
import { Button, Input, Modal, Select, Toggle, cn } from '@/ui'
import { speak } from '@/features/tts'
import { StudyHeader } from '../shared/StudyHeader'
import { useSetData } from '../shared/useSetData'
import { CardFace } from '../shared/CardFace'
import { AnswerDiff } from '../shared/AnswerDiff'
import { usePref } from '../shared/usePref'
import { sfx } from '../shared/sounds'
import { celebrate } from '../shared/confetti'
import { StatBars } from '../write/StatBars'
import { answerWrite, createWrite, nextWrite, remaining, type WriteState } from '../write/engine'

interface SpellOptions {
  answerWith: Exclude<AnswerWith, 'both'>
  showPrompt: boolean
  starredOnly: boolean
}

export default function SpellPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation('study')
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const { set, cards, loading } = useSetData(setId)
  const [stored, setStored] = usePref<Partial<SpellOptions>>('spell.options', {})
  const opts: SpellOptions = useMemo(() => ({ answerWith: 'term', showPrompt: true, starredOnly: false, ...stored }), [stored])

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
  const q = state?.current ?? null
  const card = q ? byId.get(q.cardId) : undefined
  const answerLang = q && set ? (q.answerSide === 'term' ? set.lang.term : set.lang.definition) : undefined

  const say = useCallback(
    (rate = settings.tts.rate) => {
      if (q) speak(q.answer, answerLang, { rate })
    },
    [q, answerLang, settings.tts.rate],
  )

  const begin = useCallback(
    (o: SpellOptions) => {
      const s0 = createWrite(cards, { starredOnly: o.starredOnly, shuffle: true, seed: Date.now() % 100000 })
      setState(nextWrite(s0, cards, o.answerWith))
      setFeedback(null)
      setTyped('')
      setRetyped('')
      answers.current = []
      shownAt.current = Date.now()
      void startSession(setId, 'spell', { answerWith: o.answerWith }).then((s) => (dbSession.current = s))
    },
    [cards, setId],
  )

  const started = useRef(false)
  useEffect(() => {
    if (started.current || loading || !cards.length) return
    started.current = true
    begin(opts)
  }, [loading, cards.length, begin, opts])

  // Speak each new word.
  useEffect(() => {
    if (q && !feedback) {
      say()
      inputRef.current?.focus()
    }
    // eslint-disable-next-line
  }, [q?.id])

  const submit = (text: string) => {
    if (!state || !q || !card || feedback) return
    const g = text.trim() ? gradeAnswer(text, q.accepted, { strictness: 'strict', ignoreParentheses: true }) : { correct: false }
    setFeedback({ correct: g.correct, given: text })
    if (settings.sounds) (g.correct ? sfx.correct : sfx.wrong)()
    void recordOutcome(card, g.correct, 'spell', q.variant, Date.now() - shownAt.current)
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
  }, [done, state, settings.sounds])

  const retypeOk = q ? gradeAnswer(retyped, q.accepted, { strictness: 'strict' }).correct : false

  if (loading || !set) return null

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StudyHeader mode="spell" setId={setId} title={set.title} counter={state ? `${state.correct} / ${state.total}` : undefined} onSettings={() => setOptions(true)} />
      <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-6 px-4 pb-8 md:grid-cols-[14rem_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <div className="mb-4 flex items-center gap-2 text-lg font-bold"><SpellCheck size={20} className="text-primary" /> {t('common:modes.spell')}</div>
          {state && <StatBars remaining={remaining(state)} incorrect={state.incorrect} correct={state.correct} total={state.total} />}
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
            <div className={cn('card p-6', feedback?.correct && 'border-accent ring-2 ring-accent/30')}>
              <div className="flex flex-col items-center gap-3 text-center">
                <button onClick={() => say()} className="grid h-20 w-20 place-items-center rounded-full bg-primary text-white shadow-card transition hover:bg-primary-600" aria-label={t('spell.replay')}>
                  <Volume2 size={34} />
                </button>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => say()} leftIcon={<Volume2 size={14} />}>{t('spell.replay')}</Button>
                  <Button variant="secondary" size="sm" onClick={() => say(0.55)} leftIcon={<Turtle size={14} />}>{t('spell.slower')}</Button>
                </div>
                <p className="text-sm text-muted">{t('spell.instruction')}</p>
                {opts.showPrompt && (
                  <div className="mt-2 w-full rounded-xl bg-surface-2/60 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-muted">{t(`common:common.${q.promptSide}`)}</div>
                    <CardFace text={q.prompt} image={q.promptImage} className="mt-1" />
                  </div>
                )}
              </div>

              {feedback && !feedback.correct ? (
                <div className="mt-6">
                  <AnswerDiff given={feedback.given} expected={q.answer} />
                  <form className="mt-5" onSubmit={(e) => { e.preventDefault(); if (retypeOk) next() }}>
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{t('spell.retype')}</div>
                    <div className="flex gap-2">
                      <Input autoFocus value={retyped} onChange={(e) => setRetyped(e.target.value)} className={cn(retypeOk && 'border-accent')} autoComplete="off" autoCapitalize="off" spellCheck={false} />
                      <Button type="submit" disabled={!retypeOk}>{t('common:common.continue')}</Button>
                    </div>
                  </form>
                </div>
              ) : (
                <form
                  className="mt-6 flex items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    submit(typed)
                  }}
                >
                  <div className="flex-1">
                    <Input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={!!feedback} className="text-lg" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder={t('spell.typeWhatYouHear')} aria-label={t('spell.typeWhatYouHear')} />
                  </div>
                  <Button type="submit" disabled={!typed.trim() || !!feedback}>{t('learn.answer')}</Button>
                  <Button type="button" variant="ghost" onClick={() => submit('')} disabled={!!feedback}>{t('common:common.dontKnow')}</Button>
                </form>
              )}
              {feedback?.correct && <div className="mt-3 text-center text-sm font-semibold text-accent">{t('feedback.correct')}</div>}
            </div>
          ) : (
            <div className="card p-6 text-center text-muted">{opts.starredOnly ? t('flashcards.noStarred') : t('set.noCards')}</div>
          )}
        </section>
      </main>

      <Modal open={options} onClose={() => setOptions(false)} title={t('common:common.options')} footer={<Button onClick={() => { setOptions(false); begin(opts) }}>{t('write.applyRestart')}</Button>}>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <div className="text-sm font-medium">{t('spell.hear')}</div>
              <div className="text-xs text-muted">{t('spell.hearHint')}</div>
            </div>
            <Select value={opts.answerWith} onChange={(e) => setStored({ ...stored, answerWith: e.target.value as SpellOptions['answerWith'] })} className="w-40">
              <option value="term">{t('common:common.term')}</option>
              <option value="definition">{t('common:common.definition')}</option>
            </Select>
          </div>
          <Toggle checked={opts.showPrompt} onChange={(v) => setStored({ ...stored, showPrompt: v })} label={t('spell.showPrompt')} />
          <Toggle checked={opts.starredOnly} onChange={(v) => setStored({ ...stored, starredOnly: v })} label={t('flashcards.starredOnly')} />
          {!settings.tts.enabled && <p className="py-3 text-xs text-error">{t('spell.ttsDisabled')}</p>}
        </div>
      </Modal>
    </div>
  )
}
