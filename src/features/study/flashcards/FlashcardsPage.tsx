import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Lightbulb, Pause, Play, RotateCcw, Shuffle, Star, Undo2, X } from 'lucide-react'
import { finishSession, recordOutcome, startSession, toggleStar, touchStudied } from '@/db/repo'
import type { Card, Session, Side } from '@/domain/types'
import { plainText } from '@/domain/text'
import { useSettings } from '@/app/settings-store'
import { Badge, Button, Kbd, Modal, Ring, Select, Toggle, cn } from '@/ui'
import { speak } from '@/features/tts'
import { StudyHeader } from '../shared/StudyHeader'
import { useSetData } from '../shared/useSetData'
import { FlipCard } from '../shared/FlipCard'
import { CardFace } from '../shared/CardFace'
import { SpeakButton } from '../shared/SpeakButton'
import { useKeys } from '../shared/useKeys'
import { usePref } from '../shared/usePref'
import { letterHint } from '../shared/format'
import { sfx } from '../shared/sounds'
import { celebrate } from '../shared/confetti'
import { continueLearning, createSort, finished, mark, undo, type SortState } from './engine'

type Sorting = 'browse' | 'sort' | 'srs'

const SHORTCUTS: Array<[string, string]> = [
  ['previous', '←'], ['next', '→'], ['play', 'P'], ['flip', 'Space'], ['star', 'S'], ['edit', 'E'],
  ['shuffle', 'H'], ['audio', 'A'], ['answerTerm', 'T'], ['answerDefinition', 'D'], ['stillLearning', '1'], ['know', '2'],
]

export default function FlashcardsPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation('study')
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const { set, cards, loading } = useSetData(setId)

  const [chooser, setChooser] = useState(true)
  const [chosen, setChosen] = useState<Sorting>('sort')
  const [sorting, setSorting] = useState<Sorting>('browse')
  const [options, setOptions] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const [trackProgress, setTrackProgress] = usePref('flashcards.track', true)
  const [starredOnly, setStarredOnly] = usePref('flashcards.starred', false)
  const [front, setFront] = usePref<Side>('flashcards.front', 'term')
  const [tts, setTts] = usePref('flashcards.tts', false)
  const [shuffled, setShuffled] = useState(false)
  const [seed, setSeed] = useState(1)
  const [sort, setSort] = useState<SortState>(() => createSort([]))
  const [flipped, setFlipped] = useState(false)
  const [hint, setHint] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [swipe, setSwipe] = useState<'left' | 'right' | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const dragStart = useRef<number | null>(null)

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const order = sort.order
  const index = Math.min(sort.index, Math.max(0, order.length - 1))
  const card: Card | undefined = byId.get(order[index])
  const isDone = sorting === 'sort' && finished(sort)
  const back: Side = front === 'term' ? 'definition' : 'term'
  const text = (c: Card, side: Side) => (side === 'term' ? c.term : c.definition)
  const langOf = (side: Side) => (set ? (side === 'term' ? set.lang.term : set.lang.definition) : undefined)

  const rebuild = useCallback(
    (mode: Sorting, opts: { shuffle: boolean; seed: number; starredOnly: boolean }) => {
      setSort(createSort(cards, { shuffle: opts.shuffle, seed: opts.seed, starredOnly: opts.starredOnly }))
      setFlipped(false)
      setHint(false)
      setSorting(mode)
    },
    [cards],
  )

  // Initial state once cards are loaded (before the chooser closes we show the first card already).
  const initialised = useRef(false)
  useEffect(() => {
    if (initialised.current || !cards.length) return
    initialised.current = true
    rebuild('browse', { shuffle: false, seed, starredOnly })
  }, [cards, rebuild, seed, starredOnly])

  const start = async () => {
    if (chosen === 'srs') {
      navigate(`/set/${setId}/srs`)
      return
    }
    setChooser(false)
    rebuild(chosen, { shuffle: shuffled, seed, starredOnly })
    if (chosen === 'sort') sessionRef.current = await startSession(setId, 'flashcards', { trackProgress, starredOnly })
    else await touchStudied(setId)
  }

  const flip = useCallback(() => {
    setFlipped((f) => !f)
    if (settings.sounds) sfx.flip()
  }, [settings.sounds])

  const go = useCallback(
    (delta: number) => {
      setSort((s) => ({ ...s, index: Math.max(0, Math.min(s.order.length - 1, s.index + delta)) }))
      setFlipped(false)
      setHint(false)
    },
    [],
  )

  const grade = useCallback(
    (known: boolean) => {
      if (!card || sorting !== 'sort' || isDone || swipe) return
      setSwipe(known ? 'right' : 'left')
      if (settings.sounds) (known ? sfx.correct : sfx.wrong)()
      setTimeout(() => {
        setSort((s) => mark(s, known))
        setSwipe(null)
        setFlipped(false)
        setHint(false)
      }, 320)
      if (trackProgress) void recordOutcome(card, known, 'flashcards', front === 'term' ? 'forward' : 'reverse')
    },
    [card, sorting, isDone, swipe, settings.sounds, trackProgress, front],
  )

  // Autoplay
  useEffect(() => {
    if (!playing || chooser) return
    const id = setInterval(() => {
      if (!flipped) setFlipped(true)
      else if (index < order.length - 1) go(1)
      else setPlaying(false)
    }, 2500)
    return () => clearInterval(id)
  }, [playing, flipped, index, order.length, go, chooser])

  // Auto TTS
  useEffect(() => {
    if (!tts || !card || chooser) return
    const side = flipped ? back : front
    speak(text(card, side), langOf(side), { rate: settings.tts.rate })
    // speak depends on the card face only
    // eslint-disable-next-line
  }, [tts, card?.id, flipped, chooser])

  // Round finished -> finish session + confetti
  useEffect(() => {
    if (!isDone) return
    if (settings.sounds) sfx.done()
    if (sort.learning.length === 0) void celebrate()
    const s = sessionRef.current
    if (s) {
      sessionRef.current = null
      void finishSession(s, { score: sort.known.length / Math.max(1, sort.order.length), total: sort.order.length })
    }
  }, [isDone, settings.sounds, sort.known.length, sort.learning.length, sort.order.length])

  useKeys(
    {
      ArrowLeft: () => (sorting === 'sort' ? grade(false) : go(-1)),
      ArrowRight: () => (sorting === 'sort' ? grade(true) : go(1)),
      ' ': flip,
      p: () => setPlaying((p) => !p),
      s: () => card && void toggleStar(card.id),
      e: () => navigate(`/set/${setId}/edit`),
      h: () => doShuffle(),
      a: () => card && speak(text(card, flipped ? back : front), langOf(flipped ? back : front)),
      t: () => setFront('term'),
      d: () => setFront('definition'),
      '1': () => grade(false),
      '2': () => grade(true),
      z: () => setSort((s) => undo(s)),
    },
    { enabled: !chooser && !options && !isDone },
  )

  const doShuffle = () => {
    const next = !shuffled
    const nextSeed = Date.now() % 100000
    setShuffled(next)
    setSeed(nextSeed)
    rebuild(sorting, { shuffle: next, seed: nextSeed, starredOnly })
  }

  if (loading) return null
  if (!set) return <div className="p-10 text-center text-muted">{t('set.notFound')}</div>

  const counter = order.length ? `${Math.min(index + 1, order.length)} / ${order.length}` : '0 / 0'
  const frontText = card ? text(card, front) : ''
  const backText = card ? text(card, back) : ''

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StudyHeader mode="flashcards" setId={setId} title={set.title} counter={counter} onSettings={() => setOptions(true)} />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-6">
        {sorting === 'sort' && !isDone && (
          <div className="mb-3 flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-2 text-highlight"><span className="grid h-7 min-w-7 place-items-center rounded-full border border-highlight px-2">{sort.learning.length}</span> {t('flashcards.stillLearning')}</span>
            <span className="flex items-center gap-2 text-accent">{t('flashcards.know')} <span className="grid h-7 min-w-7 place-items-center rounded-full border border-accent px-2">{sort.known.length}</span></span>
          </div>
        )}

        {isDone ? (
          <RoundSummary
            sort={sort}
            onContinue={() => {
              setSort(continueLearning(sort, shuffled, Date.now() % 100000))
              setFlipped(false)
              void startSession(setId, 'flashcards', { trackProgress, round: sort.round + 1 }).then((s) => (sessionRef.current = s))
            }}
            onRestart={() => rebuild('sort', { shuffle: shuffled, seed, starredOnly })}
            onBack={() => navigate(`/set/${setId}`)}
          />
        ) : card ? (
          <div
            className="flex flex-1 flex-col"
            onPointerDown={(e) => (dragStart.current = e.clientX)}
            onPointerUp={(e) => {
              if (dragStart.current === null || sorting !== 'sort') return
              const dx = e.clientX - dragStart.current
              dragStart.current = null
              if (Math.abs(dx) > 90) grade(dx > 0)
            }}
          >
            <FlipCard
              flipped={flipped}
              onFlip={flip}
              swipe={swipe}
              className="h-[52dvh] min-h-72 sm:h-[60dvh]"
              label={t('flashcards.flipHint')}
              topLeft={
                !flipped && (
                  <button
                    className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-text"
                    onClick={(e) => {
                      e.stopPropagation()
                      setHint((h) => !h)
                    }}
                  >
                    <Lightbulb size={14} /> {hint ? card.hint || letterHint(plainText(backText)) : t('flashcards.getHint')}
                  </button>
                )
              }
              topRight={
                <>
                  <SpeakButton text={flipped ? backText : frontText} lang={langOf(flipped ? back : front)} size={16} />
                  <button
                    aria-label={t('set.star')}
                    aria-pressed={card.starred}
                    onClick={(e) => {
                      e.stopPropagation()
                      void toggleStar(card.id)
                    }}
                    className={cn('rounded-full p-1.5 hover:bg-surface-2', card.starred ? 'text-highlight' : 'text-muted')}
                  >
                    <Star size={16} fill={card.starred ? 'currentColor' : 'none'} />
                  </button>
                </>
              }
              front={<CardFace text={frontText} image={card.image?.[front]} textClassName="text-2xl font-medium sm:text-3xl" />}
              back={<CardFace text={backText} image={card.image?.[back]} textClassName="text-2xl font-medium sm:text-3xl" />}
            />

            <div className="mt-2 hidden items-center justify-center gap-2 text-xs text-muted sm:flex">
              <span className="font-semibold">{t('flashcards.shortcut')}</span> {t('flashcards.pressSpace')} <Kbd>Space</Kbd>
            </div>

            {/* Controls */}
            {sorting === 'sort' ? (
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex items-center gap-2">
                  <Toggle checked={trackProgress} onChange={setTrackProgress} />
                  <span className="hidden text-sm text-muted sm:inline">{t('flashcards.trackProgress')}</span>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => grade(false)} aria-label={t('flashcards.stillLearning')} className="grid h-14 w-14 place-items-center rounded-full border-2 border-highlight text-highlight transition hover:bg-highlight-soft">
                    <X size={26} />
                  </button>
                  <button onClick={() => grade(true)} aria-label={t('flashcards.know')} className="grid h-14 w-14 place-items-center rounded-full border-2 border-accent text-accent transition hover:bg-accent-soft">
                    <Check size={26} />
                  </button>
                </div>
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => setSort((s) => undo(s))} disabled={!sort.history.length} aria-label={t('flashcards.undo')} className="rounded-full p-2 text-muted hover:bg-surface-2 disabled:opacity-40"><Undo2 size={18} /></button>
                  <button onClick={doShuffle} aria-label={t('common:common.shuffle')} aria-pressed={shuffled} className={cn('rounded-full p-2 hover:bg-surface-2', shuffled ? 'text-primary' : 'text-muted')}><Shuffle size={18} /></button>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div />
                <div className="flex items-center gap-3">
                  <Button variant="secondary" size="icon" onClick={() => go(-1)} disabled={index === 0} aria-label={t('common:common.previous')}><ChevronLeft /></Button>
                  <span className="min-w-16 text-center text-sm font-semibold tabular-nums">{counter}</span>
                  <Button variant="secondary" size="icon" onClick={() => go(1)} disabled={index >= order.length - 1} aria-label={t('common:common.next')}><ChevronRight /></Button>
                </div>
                <div className="flex items-center justify-end gap-1">
                  <button className={cn('rounded-full p-2 hover:bg-surface-2', playing ? 'text-primary' : 'text-muted')} onClick={() => setPlaying((p) => !p)} aria-label={t('flashcards.autoplay')} aria-pressed={playing}>
                    {playing ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <button onClick={doShuffle} aria-label={t('common:common.shuffle')} aria-pressed={shuffled} className={cn('rounded-full p-2 hover:bg-surface-2', shuffled ? 'text-primary' : 'text-muted')}><Shuffle size={18} /></button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid flex-1 place-items-center text-muted">{starredOnly ? t('flashcards.noStarred') : t('set.noCards')}</div>
        )}
      </main>

      {/* Chooser */}
      <Modal open={chooser} onClose={() => navigate(`/set/${setId}`)} title={t('flashcards.chooseSorting')} size="lg" footer={<Button onClick={() => void start()} rightIcon={<ArrowRight size={16} />}>{t('common:common.start')}</Button>}>
        <div className="space-y-3">
          {(['browse', 'sort', 'srs'] as Sorting[]).map((m) => (
            <button
              key={m}
              onClick={() => setChosen(m)}
              className={cn('w-full rounded-2xl border-2 p-4 text-left transition', chosen === m ? 'border-primary bg-primary-soft' : 'border-border bg-surface-2/60 hover:border-primary/40')}
            >
              <div className="flex items-center gap-2 font-bold">
                {t(`flashcards.sorting.${m}.title`)}
                {m === 'srs' && <Badge tone="secondary">{t('common:common.new')}</Badge>}
              </div>
              <div className="mt-0.5 text-sm text-muted">{t(`flashcards.sorting.${m}.body`)}</div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Options */}
      <Modal open={options} onClose={() => setOptions(false)} title={t('common:common.options')}>
        <div className="divide-y divide-border">
          <Toggle
            checked={sorting === 'sort'}
            onChange={(v) => {
              setTrackProgress(v)
              rebuild(v ? 'sort' : 'browse', { shuffle: shuffled, seed, starredOnly })
            }}
            label={t('flashcards.trackProgress')}
            description={t('flashcards.trackProgressHint')}
          />
          <Toggle
            checked={starredOnly}
            onChange={(v) => {
              setStarredOnly(v)
              rebuild(sorting, { shuffle: shuffled, seed, starredOnly: v })
            }}
            label={t('flashcards.starredOnly')}
          />
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="text-sm font-medium">{t('flashcards.front')}</div>
            <Select value={front} onChange={(e) => { setFront(e.target.value as Side); setFlipped(false) }} className="w-40">
              <option value="term">{t('common:common.term')}</option>
              <option value="definition">{t('common:common.definition')}</option>
            </Select>
          </div>
          <div className="py-3">
            <button className="flex w-full items-center justify-between text-sm font-medium" onClick={() => setShortcuts((s) => !s)} aria-expanded={shortcuts}>
              {t('flashcards.keyboardShortcuts')} <span className="text-primary">{shortcuts ? t('flashcards.hide') : t('flashcards.view')}</span>
            </button>
            {shortcuts && (
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {SHORTCUTS.map(([k, key]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <dt className="text-muted">{t(`flashcards.keys.${k}`)}</dt>
                    <dd><Kbd>{key}</Kbd></dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <Toggle checked={tts} onChange={setTts} label={t('common:common.textToSpeech')} description={t('flashcards.ttsHint')} />
          <div className="py-3">
            <button
              className="flex items-center gap-2 text-sm font-semibold text-error"
              onClick={() => {
                rebuild(sorting, { shuffle: shuffled, seed, starredOnly })
                setOptions(false)
              }}
            >
              <RotateCcw size={16} /> {t('flashcards.restart')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function RoundSummary({ sort, onContinue, onRestart, onBack }: { sort: SortState; onContinue: () => void; onRestart: () => void; onBack: () => void }) {
  const { t } = useTranslation('study')
  const total = sort.order.length
  const pct = total ? Math.round((sort.known.length / total) * 100) : 0
  const allKnown = sort.learning.length === 0
  return (
    <div className="card mx-auto mt-6 w-full max-w-xl p-6 text-center">
      <h2 className="text-2xl font-bold">{allKnown ? t('flashcards.summary.allKnown') : t('flashcards.summary.title', { round: sort.round })}</h2>
      <p className="mt-1 text-sm text-muted">{allKnown ? t('flashcards.summary.allKnownBody') : t('flashcards.summary.body')}</p>
      <div className="mt-6 flex items-center justify-center gap-8">
        <Ring value={pct} size={96} stroke={9} label={`${pct}%`} />
        <div className="space-y-2 text-left text-sm">
          <div className="flex items-center justify-between gap-6"><span className="text-accent">{t('flashcards.know')}</span><span className="font-bold">{sort.known.length}</span></div>
          <div className="flex items-center justify-between gap-6"><span className="text-highlight">{t('flashcards.stillLearning')}</span><span className="font-bold">{sort.learning.length}</span></div>
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {!allKnown && <Button onClick={onContinue} rightIcon={<ArrowRight size={16} />}>{t('flashcards.summary.continue', { count: sort.learning.length })}</Button>}
        <Button variant="secondary" onClick={onRestart} leftIcon={<RotateCcw size={16} />}>{t('flashcards.restart')}</Button>
        <Button variant="ghost" onClick={onBack}>{t('study.backToSet')}</Button>
      </div>
    </div>
  )
}
