import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight, Bookmark, ChevronLeft, ChevronRight, ChevronUp, Code2, Copy, Eye, EyeOff, Headphones, Lightbulb, Maximize2, MoreHorizontal, Pause, Pencil, Play, Printer, Radio, RotateCcw, Settings, Share2, Shuffle, Sparkles, Star, Trash2, Upload, Users,
} from 'lucide-react'
import { db } from '@/db/db'
import { deleteSet, duplicateSet, resetSetProgress, toggleStar, updateCard } from '@/db/repo'
import type { Bucket, Card, Side, StudySet } from '@/domain/types'
import { plainText, shuffle as shuffleArr } from '@/domain/text'
import { todayKey } from '@/domain/id'
import { useSettings } from '@/app/settings-store'
import { Badge, Button, Card as UiCard, Dropdown, EmptyState, Modal, Select, Toggle, cn, toast } from '@/ui'
import { ShareModal, ExportSetDialog, AddToCalendarButton } from '@/features/share'
import { SaveToFolderModal } from '@/features/library'
import { AskAiPanel } from '@/features/ai'
import { speak } from '@/features/tts'
import { useSetData } from './shared/useSetData'
import { FlipCard } from './shared/FlipCard'
import { CardFace } from './shared/CardFace'
import { SpeakButton } from './shared/SpeakButton'
import { GAME_MODES, MODE_ICONS, STUDY_MODES, modePath } from './shared/ModeSwitcher'
import { formatDate, letterHint, relativeTime } from './shared/format'
import { usePref } from './shared/usePref'
import { buildPlan } from './srs/session'

type SortKey = 'original' | 'alphabetical' | 'stats'
const BUCKET_ORDER: Bucket[] = ['learning', 'new', 'known', 'mastered']
const BUCKET_TONE: Record<Bucket, string> = { new: 'text-primary', learning: 'text-highlight', known: 'text-secondary', mastered: 'text-accent' }
const GAME_GRADIENT: Record<string, string> = {
  match: 'bg-gradient-indigo',
  blocks: 'bg-gradient-orange',
  blast: 'bg-gradient-teal',
  charms: 'bg-gradient-green',
  hangman: 'bg-gradient-orange',
  wordsearch: 'bg-gradient-teal',
  speedreview: 'bg-gradient-indigo',
}

export default function SetPage() {
  const { setId = '' } = useParams()
  const { t, i18n } = useTranslation('study')
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const { set, cards, progress, loading, missing } = useSetData(setId)

  const [share, setShare] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'reset' | null>(null)
  const [sort, setSort] = usePref<SortKey>('set.sort', 'original')
  const [hideDefs, setHideDefs] = useState(false)
  const [srsDismissed, setSrsDismissed] = usePref<Record<string, string>>('set.srsDismissed', {})

  const bucketOf = useMemo(() => {
    const m = new Map<string, Bucket>()
    for (const p of progress) if (p.variant === 'forward' || p.variant.startsWith('cloze')) m.set(p.cardId, p.bucket)
    return (c: Card): Bucket => m.get(c.id) ?? 'new'
  }, [progress])

  const stats = useMemo(() => {
    const counts: Record<Bucket, number> = { new: 0, learning: 0, known: 0, mastered: 0 }
    for (const c of cards) counts[bucketOf(c)]++
    const n = cards.length || 1
    const mastery = Math.round(((counts.learning * 1 + counts.known * 2 + counts.mastered * 3) / (3 * n)) * 100)
    return { counts, mastery }
  }, [cards, bucketOf])

  const plan = useMemo(() => (set ? buildPlan(cards, set, progress, settings.srs) : { due: [], fresh: [] }), [cards, set, progress, settings.srs])
  const today = todayKey()
  const showSrs = cards.length > 0 && srsDismissed[setId] !== today && plan.due.length + plan.fresh.length > 0

  const related = useLiveQuery(async () => {
    if (!set) return []
    const all = await db.sets.filter((s) => s.id !== set.id && !s.draft && ((!!s.folderId && s.folderId === set.folderId) || s.tags.some((tag) => set.tags.includes(tag)))).limit(6).toArray()
    return Promise.all(all.map(async (s) => ({ set: s, count: await db.cards.where('setId').equals(s.id).count() })))
  }, [set?.id, set?.folderId, set?.tags.join('|')])

  const act = useCallback(
    async (what: 'duplicate' | 'reset' | 'delete') => {
      if (what === 'duplicate') {
        const copy = await duplicateSet(setId)
        if (copy) {
          toast.success(t('set.duplicated'))
          navigate(`/set/${copy.id}`)
        }
      } else if (what === 'reset') {
        await resetSetProgress(setId)
        toast.success(t('set.progressReset'))
      } else {
        await deleteSet(setId)
        toast.success(t('set.deleted'))
        navigate('/library')
      }
      setConfirm(null)
    },
    [setId, navigate, t],
  )

  if (loading) return <div className="grid min-h-[50vh] place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
  if (missing || !set) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <EmptyState title={t('set.notFound')} description={t('set.notFoundHint')} action={<Link to="/library"><Button variant="secondary">{t('common:nav.library')}</Button></Link>} />
      </div>
    )
  }

  const lang = i18n.language
  const menu = [
    { label: t('common:common.edit'), icon: <Pencil size={16} />, onSelect: () => navigate(`/set/${setId}/edit`) },
    { label: t('set.print'), icon: <Printer size={16} />, onSelect: () => navigate(`/set/${setId}/print`) },
    { label: t('set.embed'), icon: <Code2 size={16} />, onSelect: () => setShare(true) },
    { label: t('common:common.export'), icon: <Upload size={16} />, onSelect: () => setExportOpen(true) },
    { label: t('set.duplicate'), icon: <Copy size={16} />, onSelect: () => void act('duplicate') },
    { divider: true, label: '' },
    { label: t('set.resetProgress'), icon: <RotateCcw size={16} />, onSelect: () => setConfirm('reset') },
    { label: t('common:common.delete'), icon: <Trash2 size={16} />, onSelect: () => setConfirm('delete'), danger: true },
  ]

  return (
    <div className="mx-auto max-w-4xl pb-28">
      {/* Title + actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{set.title || '…'}</h1>
          {set.description && <p className="mt-1 text-sm text-muted">{set.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-medium text-text">{t('common:common.terms', { count: cards.length })}</span>
            <span aria-hidden>·</span>
            <span>{t('set.created', { date: formatDate(set.createdAt, lang) })}</span>
            <span aria-hidden>·</span>
            <span>{set.lastStudiedAt ? t('set.lastStudied', { when: relativeTime(set.lastStudiedAt, lang) }) : t('set.neverStudied')}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-16 overflow-hidden rounded-full bg-surface-2 align-middle"><span className="block h-full rounded-full bg-accent" style={{ width: `${stats.mastery}%` }} /></span>
              {t('set.mastery', { pct: stats.mastery })}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/set/${setId}/listen`}><Button variant="secondary" size="sm" leftIcon={<Headphones size={16} />}>{t('set.listen')}</Button></Link>
          <Button variant="secondary" size="sm" onClick={() => setFolderOpen(true)} aria-label={t('set.saveToFolder')} title={t('set.saveToFolder')}><Bookmark size={16} /></Button>
          <AddToCalendarButton setId={setId} title={set.title} />
          <Button variant="secondary" size="sm" onClick={() => setShare(true)} aria-label={t('common:common.share')} title={t('common:common.share')}><Share2 size={16} /></Button>
          <Dropdown trigger={<Button variant="secondary" size="sm" aria-label={t('set.more')}><MoreHorizontal size={16} /></Button>} items={menu} />
        </div>
      </div>

      {/* Live buttons */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link to={`/live/host/${setId}?mode=study`} className="card flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-surface-2">
          <Users size={18} className="text-primary" /> {t('set.studyWithFriends')} <Badge tone="secondary">{t('common:common.new')}</Badge>
        </Link>
        <Link to={`/live/host/${setId}`} className="card flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-surface-2">
          <Radio size={18} className="text-primary" /> {t('set.playLive')}
        </Link>
      </div>

      {/* Mode tiles */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STUDY_MODES.filter((m) => m !== 'srs').map((m) => {
          const Icon = MODE_ICONS[m]
          return (
            <Link key={m} to={modePath(setId, m)} className="card flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold hover:bg-surface-2 hover:border-primary/50">
              <Icon size={18} className="text-primary" /> {t(`common:modes.${m}`)}
            </Link>
          )
        })}
      </div>

      {/* SRS prompt */}
      {showSrs && (
        <UiCard className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted"><RotateCcw size={16} className="text-primary" /> {t('common:modes.srs')}</div>
            <h2 className="mt-1 text-xl font-bold">{t('set.srsReady')}</h2>
            <p className="mt-1 text-sm text-muted">{t('set.srsHint')}</p>
            <div className="mt-2 flex gap-2 text-xs">
              <Badge tone="accent">{t('srs.toReview', { count: plan.due.length })}</Badge>
              <Badge tone="primary">{t('srs.newCards', { count: plan.fresh.length })}</Badge>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:w-48">
            <Button onClick={() => navigate(`/set/${setId}/srs`)}>{t('set.go')}</Button>
            <Button variant="ghost" onClick={() => setSrsDismissed({ ...srsDismissed, [setId]: today })}>{t('set.dismiss')}</Button>
          </div>
        </UiCard>
      )}

      {/* Embedded flashcards */}
      {cards.length > 0 ? (
        <EmbeddedFlashcards setId={setId} set={set} cards={cards} />
      ) : (
        <div className="mt-4">
          <EmptyState title={t('set.noCards')} description={t('set.noCardsHint')} action={<Link to={`/set/${setId}/edit`}><Button leftIcon={<Pencil size={16} />}>{t('set.addCards')}</Button></Link>} />
        </div>
      )}

      {/* Games */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t('set.gamesTitle')}</h2>
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {GAME_MODES.map((g) => {
            const Icon = MODE_ICONS[g]
            return (
              <Link key={g} to={modePath(setId, g)} className="card w-44 shrink-0 snap-start overflow-hidden p-0 transition hover:-translate-y-0.5">
                <div className="flex items-center justify-between px-4 pt-3 text-sm font-bold">
                  {t(`common:modes.${g}`)}
                  {(g === 'charms' || g === 'speedreview') && <Badge tone="secondary">{t('common:common.new')}</Badge>}
                </div>
                <div className={cn('m-3 grid h-24 place-items-center rounded-xl text-white', GAME_GRADIENT[g])}>
                  <Icon size={36} />
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Related sets */}
      {!!related?.length && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{t('set.related')}</h2>
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {related.map(({ set: s, count }) => (
              <Link key={s.id} to={`/set/${s.id}`} className="card w-60 shrink-0 snap-start p-4 hover:bg-surface-2">
                <div className="truncate font-semibold">{s.title || '…'}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge>{t('common:common.terms', { count })}</Badge>
                  {s.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} tone="primary">{tag}</Badge>
                  ))}
                </div>
                {s.author && <div className="mt-3 truncate text-xs text-muted">{s.author}</div>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Terms */}
      {cards.length > 0 && (
        <TermsList cards={cards} set={set} sort={sort} onSort={setSort} bucketOf={bucketOf} counts={stats.counts} hideDefs={hideDefs} />
      )}

      {/* Sticky bottom bar */}
      {cards.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-end px-4 safe-bottom sm:px-6 lg:px-8">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-surface/95 p-1.5 shadow-pop backdrop-blur">
            <Button variant="outline" size="sm" aria-label={hideDefs ? t('set.showDefinitions') : t('set.hideDefinitions')} title={hideDefs ? t('set.showDefinitions') : t('set.hideDefinitions')} onClick={() => setHideDefs((v) => !v)} className="px-3">
              {hideDefs ? <Eye size={16} /> : <EyeOff size={16} />}
              <span className="hidden md:inline">{hideDefs ? t('set.showDefinitions') : t('set.hideDefinitions')}</span>
            </Button>
            <ActivityMenu setId={setId} />
          </div>
        </div>
      )}
      <AskAiPanel setId={setId} />

      <ShareModal open={share} onClose={() => setShare(false)} setId={setId} />
      <ExportSetDialog open={exportOpen} onClose={() => setExportOpen(false)} setId={setId} />
      <SaveToFolderModal open={folderOpen} onClose={() => setFolderOpen(false)} setId={setId} />
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm === 'delete' ? t('set.deleteTitle') : t('set.resetTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t('common:common.cancel')}</Button>
            <Button variant="danger" onClick={() => confirm && void act(confirm)}>{confirm === 'delete' ? t('common:common.delete') : t('set.resetProgress')}</Button>
          </>
        }
      >
        <p className="text-sm text-muted">{confirm === 'delete' ? t('set.deleteBody', { title: set.title }) : t('set.resetBody')}</p>
      </Modal>
    </div>
  )
}

// ---------- Embedded flashcard viewer ----------

function EmbeddedFlashcards({ setId, set, cards }: { setId: string; set: StudySet; cards: Card[] }) {
  const { t } = useTranslation('study')
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const [front, setFront] = usePref<Side>('flashcards.front', 'term')
  const [autoTts, setAutoTts] = usePref<boolean>('flashcards.tts', false)
  const [order, setOrder] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [hint, setHint] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [options, setOptions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const list = useMemo(() => {
    if (!order) return cards
    const byId = new Map(cards.map((c) => [c.id, c]))
    return order.map((id) => byId.get(id)).filter((c): c is Card => !!c)
  }, [cards, order])
  const safeIndex = Math.min(index, Math.max(0, list.length - 1))
  const card = list[safeIndex]
  const back: Side = front === 'term' ? 'definition' : 'term'
  const frontText = card ? (front === 'term' ? card.term : card.definition) : ''
  const backText = card ? (back === 'term' ? card.term : card.definition) : ''
  const frontLang = front === 'term' ? set.lang.term : set.lang.definition
  const backLang = back === 'term' ? set.lang.term : set.lang.definition

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.max(0, Math.min(list.length - 1, i + delta)))
      setFlipped(false)
      setHint(false)
    },
    [list.length],
  )

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      if (!flipped) setFlipped(true)
      else if (safeIndex < list.length - 1) go(1)
      else setPlaying(false)
    }, 2200)
    return () => clearInterval(id)
  }, [playing, flipped, safeIndex, list.length, go])

  useEffect(() => {
    if (autoTts && settings.tts.enabled && card) speak(flipped ? backText : frontText, flipped ? backLang : frontLang, { rate: settings.tts.rate })
  }, [flipped, safeIndex, autoTts, card, backText, frontText, backLang, frontLang, settings.tts.enabled, settings.tts.rate])

  if (!card) return null
  return (
    <section className="mt-4" ref={containerRef} onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1) }}>
      <FlipCard
        flipped={flipped}
        onFlip={() => setFlipped((f) => !f)}
        className="h-80 sm:h-96"
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
              <Lightbulb size={14} /> {hint ? (card.hint || letterHint(plainText(backText))) : t('flashcards.getHint')}
            </button>
          )
        }
        topRight={
          <>
            <SpeakButton text={flipped ? backText : frontText} lang={flipped ? backLang : frontLang} size={16} />
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
        front={<CardFace text={frontText} image={front === 'term' ? card.image?.term : card.image?.definition} textClassName="text-xl font-medium sm:text-2xl" />}
        back={<CardFace text={backText} image={back === 'term' ? card.image?.term : card.image?.definition} textClassName="text-xl font-medium sm:text-2xl" />}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={() => navigate(`/set/${setId}/flashcards`)}>{t('set.sortFlashcards')}</Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" onClick={() => go(-1)} disabled={safeIndex === 0} aria-label={t('common:common.previous')}><ChevronLeft /></Button>
          <span className="min-w-16 text-center text-sm font-semibold tabular-nums">{safeIndex + 1} / {list.length}</span>
          <Button variant="secondary" size="icon" onClick={() => go(1)} disabled={safeIndex >= list.length - 1} aria-label={t('common:common.next')}><ChevronRight /></Button>
        </div>
        <div className="flex items-center gap-1">
          <button className={cn('rounded-full p-2 hover:bg-surface-2', playing ? 'text-primary' : 'text-muted')} onClick={() => setPlaying((p) => !p)} aria-label={t('flashcards.autoplay')} aria-pressed={playing}>
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            className={cn('rounded-full p-2 hover:bg-surface-2', order ? 'text-primary' : 'text-muted')}
            onClick={() => {
              setOrder(order ? null : shuffleArr(cards).map((c) => c.id))
              setIndex(0)
              setFlipped(false)
            }}
            aria-label={t('common:common.shuffle')}
            aria-pressed={!!order}
          >
            <Shuffle size={18} />
          </button>
          <button className="rounded-full p-2 text-muted hover:bg-surface-2" onClick={() => setOptions(true)} aria-label={t('common:common.options')}><Settings size={18} /></button>
          <button className="rounded-full p-2 text-muted hover:bg-surface-2" onClick={() => navigate(`/set/${setId}/flashcards`)} aria-label={t('flashcards.fullscreen')}><Maximize2 size={18} /></button>
        </div>
      </div>
      <Modal open={options} onClose={() => setOptions(false)} title={t('common:common.options')} size="sm">
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="text-sm font-medium">{t('flashcards.front')}</div>
            <Select value={front} onChange={(e) => { setFront(e.target.value as Side); setFlipped(false) }} className="w-40">
              <option value="term">{t('common:common.term')}</option>
              <option value="definition">{t('common:common.definition')}</option>
            </Select>
          </div>
          <Toggle checked={autoTts} onChange={setAutoTts} label={t('common:common.textToSpeech')} description={t('flashcards.ttsHint')} />
        </div>
      </Modal>
    </section>
  )
}

// ---------- Terms list ----------

function TermsList({ cards, set, sort, onSort, bucketOf, counts, hideDefs }: { cards: Card[]; set: StudySet; sort: SortKey; onSort: (s: SortKey) => void; bucketOf: (c: Card) => Bucket; counts: Record<Bucket, number>; hideDefs: boolean }) {
  const { t } = useTranslation('study')
  const sorted = useMemo(() => {
    if (sort === 'alphabetical') return cards.slice().sort((a, b) => plainText(a.term).localeCompare(plainText(b.term), undefined, { sensitivity: 'base' }))
    return cards
  }, [cards, sort])

  const groups = useMemo(() => {
    if (sort !== 'stats') return null
    return BUCKET_ORDER.map((b) => ({ bucket: b, cards: cards.filter((c) => bucketOf(c) === b) })).filter((g) => g.cards.length)
  }, [cards, sort, bucketOf])

  const starAll = async (list: Card[]) => {
    await Promise.all(list.filter((c) => !c.starred).map((c) => updateCard(c.id, { starred: true })))
    toast.success(t('set.selected', { count: list.length }))
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t('set.termsTitle', { count: cards.length })}</h2>
        <Dropdown
          trigger={
            <Button variant="ghost" size="sm" rightIcon={<ChevronUp size={14} className="rotate-180" />}>
              {t(`set.sort.${sort}`)}
            </Button>
          }
          items={(['original', 'alphabetical', 'stats'] as SortKey[]).map((k) => ({ label: t(`set.sort.${k}`), onSelect: () => onSort(k) }))}
        />
      </div>
      {groups ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.bucket}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <h3 className={cn('text-base font-bold', BUCKET_TONE[g.bucket])}>
                    {t(`common:bucket.${g.bucket}`)} ({counts[g.bucket]})
                  </h3>
                  <p className="text-sm text-muted">{t(`set.bucketHint.${g.bucket}`)}</p>
                </div>
                <Button variant="secondary" size="sm" leftIcon={<Star size={14} />} onClick={() => void starAll(g.cards)}>
                  {t('set.selectThese', { count: g.cards.length })}
                </Button>
              </div>
              <div className="space-y-2">
                {g.cards.map((c) => (
                  <TermRow key={`${c.id}:${hideDefs}`} card={c} set={set} hideDef={hideDefs} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => (
            <TermRow key={`${c.id}:${hideDefs}`} card={c} set={set} hideDef={hideDefs} />
          ))}
        </div>
      )}
    </section>
  )
}

function TermRow({ card, set, hideDef }: { card: Card; set: StudySet; hideDef: boolean }) {
  const { t } = useTranslation('study')
  const [revealed, setRevealed] = useState(false)
  const hidden = hideDef && !revealed
  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 sm:border-r sm:border-border sm:pr-4">
        <CardFace text={card.term} image={card.image?.term} className="items-start text-left" textClassName="text-sm sm:text-base" imgClassName="max-h-28" />
      </div>
      <div className="min-w-0 flex-[1.4]">
        {hidden ? (
          <button className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted hover:bg-surface-2" onClick={() => setRevealed(true)}>
            {t('set.reveal')}
          </button>
        ) : (
          <CardFace text={card.definition} image={card.image?.definition} className="items-start text-left" textClassName="text-sm sm:text-base" imgClassName="max-h-28" />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
        <button aria-label={t('set.star')} aria-pressed={card.starred} onClick={() => void toggleStar(card.id)} className={cn('rounded-full p-1.5 hover:bg-surface-2', card.starred ? 'text-highlight' : 'text-muted')}>
          <Star size={16} fill={card.starred ? 'currentColor' : 'none'} />
        </button>
        <SpeakButton text={`${card.term}. ${card.definition}`} lang={set.lang.term} size={16} />
      </div>
    </div>
  )
}

// ---------- "Review with an activity" (opens upwards) ----------

function ActivityMenu({ setId }: { setId: string }) {
  const { t } = useTranslation('study')
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const modes = [...STUDY_MODES, 'match', 'blocks', 'blast'] as const
  return (
    <div ref={ref} className="relative">
      <Button size="sm" rightIcon={<ChevronUp size={14} />} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t('set.reviewWith')}>
        <span className="md:hidden">{t('set.reviewWithShort')}</span>
        <span className="hidden md:inline">{t('set.reviewWith')}</span>
      </Button>
      {open && (
        <div role="menu" className="animate-pop absolute bottom-full right-0 mb-2 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-pop">
          {modes.map((m) => {
            const Icon = MODE_ICONS[m]
            return (
              <button key={m} role="menuitem" onClick={() => navigate(modePath(setId, m))} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
                <Icon size={16} className="text-primary" /> {t(`common:modes.${m}`)}
              </button>
            )
          })}
          <div className="my-1 border-t border-border" />
          <button role="menuitem" onClick={() => navigate(`/live/host/${setId}`)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
            <Sparkles size={16} className="text-primary" /> {t('common:modes.live')} <ArrowRight size={14} className="ml-auto text-muted" />
          </button>
        </div>
      )}
    </div>
  )
}
