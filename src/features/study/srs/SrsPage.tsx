import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { RotateCcw } from 'lucide-react'
import { finishSession, logReview, saveProgress, startSession, updateCard } from '@/db/repo'
import type { Progress, Rating, Session } from '@/domain/types'
import { RATING_LABEL_KEYS, RATINGS, applyRating, confidenceToRating, makeScheduler, previewRatings } from '@/domain/srs'
import { useSettings } from '@/app/settings-store'
import { Badge, Button, Kbd, Modal, ProgressBar, Toggle, cn, toast } from '@/ui'
import { speak } from '@/features/tts'
import { StudyHeader } from '../shared/StudyHeader'
import { useSetData } from '../shared/useSetData'
import { FlipCard } from '../shared/FlipCard'
import { CardFace } from '../shared/CardFace'
import { SpeakButton } from '../shared/SpeakButton'
import { useKeys } from '../shared/useKeys'
import { usePref } from '../shared/usePref'
import { sfx } from '../shared/sounds'
import { celebrate } from '../shared/confetti'
import { relativeTime } from '../shared/format'
import { afterRating, buildPlan, createSession, faces, stateLabel, type SrsSession } from './session'

const RATING_TONE: Record<Rating, string> = {
  1: 'border-error text-error hover:bg-error-soft',
  2: 'border-highlight text-highlight hover:bg-highlight-soft',
  3: 'border-primary text-primary hover:bg-primary-soft',
  4: 'border-accent text-accent hover:bg-accent-soft',
}

export default function SrsPage() {
  const { setId = '' } = useParams()
  const { t, i18n } = useTranslation('study')
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const { set, cards, progress, loading } = useSetData(setId)

  const [planOpen, setPlanOpen] = useState(true)
  const [options, setOptions] = useState(false)
  const [confidence, setConfidence] = usePref('srs.confidence', false)
  const [tts, setTts] = usePref('srs.tts', false)
  const [session, setSession] = useState<SrsSession | null>(null)
  const [flipped, setFlipped] = useState(false)
  const shownAt = useRef(0)
  const dbSession = useRef<Session | null>(null)
  const scheduler = useMemo(() => makeScheduler(settings.srs), [settings.srs])

  // The plan is only read before the session starts; the session keeps its own queue afterwards.
  const plan = useMemo(() => (set ? buildPlan(cards, set, progress, settings.srs) : null), [set, cards, progress, settings.srs])

  const item = session?.queue[0]
  const face = item ? faces(item.card, item.progress.variant) : null
  const previews = useMemo(() => (item ? previewRatings(scheduler, item.progress.fsrs) : []), [item, scheduler])
  const done = !!session && session.queue.length === 0

  const start = async () => {
    if (!plan) return
    setPlanOpen(false)
    setSession(createSession(plan))
    shownAt.current = Date.now()
    dbSession.current = await startSession(setId, 'srs', { due: plan.due.length, fresh: plan.fresh.length })
  }

  const rate = useCallback(
    async (rating: Rating, conf?: 1 | 2 | 3 | 4 | 5) => {
      if (!session || !item || !flipped) return
      const now = Date.now()
      const out = applyRating(scheduler, item.progress.fsrs, rating, now, settings.srs)
      const updated: Progress = { ...item.progress, fsrs: out.fsrs, bucket: out.bucket, confidence: conf ?? item.progress.confidence, lastMode: 'srs', correct: item.progress.correct + (rating > 1 ? 1 : 0), incorrect: item.progress.incorrect + (rating === 1 ? 1 : 0) }
      await saveProgress(updated)
      await logReview({ cardId: item.card.id, setId, variant: item.progress.variant, rating, state: out.log.state, scheduledDays: out.log.scheduledDays, elapsedDays: out.log.elapsedDays, durationMs: now - shownAt.current, mode: 'srs' })
      if (out.leech && !item.card.leech) {
        await updateCard(item.card.id, { leech: true, suspended: settings.srs.leechAction === 'suspend' ? true : item.card.suspended })
        toast.info(t(settings.srs.leechAction === 'suspend' ? 'srs.leechSuspended' : 'srs.leechTagged'))
      }
      if (settings.sounds) (rating === 1 ? sfx.wrong : sfx.correct)()
      setSession(afterRating(session, updated, rating, now))
      setFlipped(false)
      shownAt.current = Date.now()
    },
    [session, item, flipped, scheduler, settings.srs, settings.sounds, setId, t],
  )

  useEffect(() => {
    if (!done || !session) return
    if (settings.sounds) sfx.done()
    void celebrate()
    const s = dbSession.current
    if (s) {
      dbSession.current = null
      void finishSession(s, { total: session.total, score: session.total ? (session.counts[3] + session.counts[4]) / session.total : undefined })
    }
  }, [done, session, settings.sounds])

  useEffect(() => {
    if (!tts || !face || planOpen) return
    const side = flipped ? face.back : face.front
    const lang = item?.progress.variant === 'reverse' ? set?.lang.definition : set?.lang.term
    speak(side, lang, { rate: settings.tts.rate })
    // eslint-disable-next-line
  }, [tts, item?.progress.id, flipped, planOpen])

  useKeys(
    {
      ' ': () => !flipped && setFlipped(true),
      Enter: () => !flipped && setFlipped(true),
      '1': () => (confidence ? void rate(confidenceToRating(1), 1) : void rate(1)),
      '2': () => (confidence ? void rate(confidenceToRating(2), 2) : void rate(2)),
      '3': () => (confidence ? void rate(confidenceToRating(3), 3) : void rate(3)),
      '4': () => (confidence ? void rate(confidenceToRating(4), 4) : void rate(4)),
      '5': () => confidence && void rate(confidenceToRating(5), 5),
    },
    { enabled: !planOpen && !options && !done },
  )

  if (loading || !set) return null
  const total = session?.total ?? 0
  const counter = session ? `${session.finished} / ${total}` : `0 / ${(plan?.due.length ?? 0) + (plan?.fresh.length ?? 0)}`
  const label = item ? stateLabel(item.progress) : 'new'

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StudyHeader mode="srs" setId={setId} title={set.title} counter={counter} onSettings={() => setOptions(true)} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-6">
        {session && !done && <ProgressBar value={session.finished} max={Math.max(1, total)} tone="highlight" className="mb-4 h-2.5" />}

        {done && session ? (
          <div className="card mx-auto mt-6 w-full max-w-xl p-6 text-center">
            <h2 className="text-2xl font-bold">{t('srs.doneTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('srs.doneBody', { count: session.finished })}</p>
            <div className="mt-5 grid grid-cols-4 gap-2 text-sm">
              {RATINGS.map((r) => (
                <div key={r} className={cn('rounded-xl border-2 p-3', RATING_TONE[r].split(' ').slice(0, 2).join(' '))}>
                  <div className="text-2xl font-bold">{session.counts[r]}</div>
                  <div className="text-xs">{t(`common:rating.${RATING_LABEL_KEYS[r]}`)}</div>
                </div>
              ))}
            </div>
            {session.nextDue && <p className="mt-5 text-sm text-muted">{t('srs.nextDue', { when: relativeTime(session.nextDue, i18n.language) })}</p>}
            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={() => navigate(`/set/${setId}`)}>{t('study.backToSet')}</Button>
              <Button variant="ghost" onClick={() => navigate(`/set/${setId}/learn`)}>{t('srs.continueLearn')}</Button>
            </div>
          </div>
        ) : item && face ? (
          <>
            <FlipCard
              flipped={flipped}
              onFlip={() => !flipped && setFlipped(true)}
              className="h-[56dvh] min-h-72 sm:h-[64dvh]"
              label={t('flashcards.flipHint')}
              topLeft={<Badge tone={label === 'new' ? 'primary' : label === 'learning' ? 'highlight' : 'accent'}>{t(`srs.state.${label}`)}</Badge>}
              topRight={<SpeakButton text={flipped ? face.back : face.front} lang={item.progress.variant === 'reverse' ? set.lang.definition : set.lang.term} size={16} />}
              front={<CardFace text={face.front} image={face.frontImage} textClassName="text-2xl font-medium sm:text-3xl" />}
              back={<CardFace text={face.back} image={face.backImage} textClassName="text-2xl font-medium sm:text-3xl" />}
            />
            <div className="mt-5 flex justify-center">
              {!flipped ? (
                <Button size="lg" variant="secondary" className="w-64" onClick={() => setFlipped(true)}>
                  {t('srs.flip')} <Kbd>Space</Kbd>
                </Button>
              ) : confidence ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('srs.confidence')}</div>
                  <div className="flex gap-2">
                    {([1, 2, 3, 4, 5] as const).map((c) => (
                      <button key={c} onClick={() => void rate(confidenceToRating(c), c)} className={cn('flex h-14 w-14 flex-col items-center justify-center rounded-xl border-2 font-bold transition', RATING_TONE[confidenceToRating(c)])}>
                        {c}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-muted">{t('srs.confidenceHint')}</div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {previews.map((p) => (
                    <button key={p.rating} onClick={() => void rate(p.rating)} className={cn('flex min-w-20 flex-col items-center rounded-xl border-2 px-3 py-2 transition', RATING_TONE[p.rating])}>
                      <span className="text-sm font-bold">{t(`common:rating.${RATING_LABEL_KEYS[p.rating]}`)}</span>
                      <span className="text-xs opacity-80">{p.label === '<1m' ? '≤1m' : p.label}</span>
                      <Kbd>{p.rating}</Kbd>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          !planOpen && <div className="grid flex-1 place-items-center text-muted">{t('srs.nothingDue')}</div>
        )}
      </main>

      <Modal open={planOpen} onClose={() => navigate(`/set/${setId}`)} title={t('srs.planTitle')} size="lg" footer={<Button onClick={() => void start()} disabled={!plan || plan.due.length + plan.fresh.length === 0}>{t('common:common.start')}</Button>}>
        {plan && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-accent-soft p-5 text-center text-accent">
              <div className="text-sm font-semibold">{t('srs.cardsToReview')}</div>
              <div className="text-4xl font-bold">{plan.due.length}</div>
            </div>
            <div className="rounded-2xl bg-primary-soft p-5 text-center text-primary">
              <div className="text-sm font-semibold">{t('srs.newCardsLabel')}</div>
              <div className="text-4xl font-bold">{plan.fresh.length}</div>
            </div>
            {plan.due.length + plan.fresh.length === 0 && (
              <p className="col-span-2 text-center text-sm text-muted">
                {t('srs.nothingDue')}{' '}
                {progress.length > 0 && t('srs.nextDue', { when: relativeTime(Math.min(...progress.map((p) => p.fsrs.due)), i18n.language) })}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal open={options} onClose={() => setOptions(false)} title={t('common:common.options')}>
        <div className="divide-y divide-border">
          <Toggle checked={confidence} onChange={setConfidence} label={t('srs.confidenceMode')} description={t('srs.confidenceModeHint')} />
          <Toggle checked={tts} onChange={setTts} label={t('common:common.textToSpeech')} description={t('flashcards.ttsHint')} />
          <div className="py-3 text-sm text-muted">
            {t('srs.settingsHint', { retention: Math.round(settings.srs.requestRetention * 100), newPerDay: settings.srs.newPerDay })}{' '}
            <button className="font-semibold text-primary" onClick={() => navigate('/settings')}>{t('common:nav.settings')}</button>
          </div>
          <div className="py-3">
            <button className="flex items-center gap-2 text-sm font-semibold text-error" onClick={() => { setOptions(false); setSession(null); setPlanOpen(true) }}>
              <RotateCcw size={16} /> {t('common:common.restart')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
