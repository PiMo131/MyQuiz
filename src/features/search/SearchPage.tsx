import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Clock, Eye, Folder as FolderIcon, Search, X } from 'lucide-react'
import { db } from '@/db/db'
import { getCards } from '@/db/repo'
import type { Card, StudySet } from '@/domain/types'
import { Badge, Button, EmptyState, Markdown, Modal, Tabs, cn } from '@/ui'
import { useSetMeta } from '@/features/library'
import { addRecentSearch, clearRecentSearches, getRecentSearches, highlightSegments, searchCards, searchFolders, searchSets, subscribeRecentSearches, type CardHit, type SetHit } from './search'

type Tab = 'all' | 'sets' | 'cards' | 'folders'

export function Highlight({ text, q, className }: { text: string; q: string; className?: string }) {
  const segs = useMemo(() => highlightSegments(text, q), [text, q])
  return (
    <span className={className}>
      {segs.map((s, i) => (s.hit ? <mark key={i} className="rounded-sm bg-highlight/30 px-0.5 text-text">{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </span>
  )
}

export default function SearchPage() {
  const { t } = useTranslation('library')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [input, setInput] = useState(q)
  const [tab, setTab] = useState<Tab>('all')
  const [preview, setPreview] = useState<StudySet | null>(null)
  const [prevQ, setPrevQ] = useState(q)
  if (q !== prevQ) {
    setPrevQ(q)
    setInput(q)
  }
  useEffect(() => {
    if (q.trim()) addRecentSearch(q)
  }, [q])
  const recent = useSyncExternalStore(subscribeRecentSearches, getRecentSearches)

  const sets = useLiveQuery(() => db.sets.toArray(), [])
  const folders = useLiveQuery(() => db.folders.toArray(), [])
  const cards = useLiveQuery(() => (q.trim() ? db.cards.toArray() : Promise.resolve([] as Card[])), [q])
  const meta = useSetMeta()
  const setMap = useMemo(() => new Map((sets ?? []).map((s) => [s.id, s])), [sets])

  const setHits = useMemo(() => searchSets(sets ?? [], q), [sets, q])
  const cardHits = useMemo(() => searchCards(cards ?? [], setMap, q), [cards, setMap, q])
  const folderHits = useMemo(() => searchFolders(folders ?? [], q), [folders, q])
  const total = setHits.length + cardHits.length + folderHits.length

  const submit = (value: string) => {
    const v = value.trim()
    setParams(v ? { q: v } : {}, { replace: false })
  }

  return (
    <div className="mx-auto max-w-5xl">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          submit(input)
        }}
      >
        <Search size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('common:common.search')}
          className="h-14 w-full rounded-2xl border border-border bg-surface pl-13 pr-24 text-base shadow-card placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {input && (
          <button type="button" onClick={() => { setInput(''); submit('') }} aria-label={t('common:common.close')} className="absolute right-24 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-text">
            <X size={16} />
          </button>
        )}
        <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2">{t('common:common.search')}</Button>
      </form>

      {!q.trim() && (
        <div className="mt-8">
          {recent.length > 0 ? (
            <section aria-label={t('search.recent')}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t('search.recent')}</h2>
                <button onClick={() => clearRecentSearches()} className="text-sm text-muted hover:text-text">{t('search.clearRecent')}</button>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {recent.map((r) => (
                  <li key={r}>
                    <button onClick={() => submit(r)} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm hover:border-primary hover:text-primary">
                      <Clock size={14} className="text-faint" />
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <EmptyState icon={<Search />} title={t('search.emptyTitle')} description={t('search.emptyBody')} />
          )}
        </div>
      )}

      {q.trim() && (
        <>
          <h1 className="mt-6 text-2xl font-bold">{t('search.resultsFor', { query: q })}</h1>
          <Tabs
            className="mt-3"
            variant="underline"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'all', label: t('search.tabs.all'), count: total },
              { value: 'sets', label: t('search.tabs.sets'), count: setHits.length },
              { value: 'cards', label: t('search.tabs.cards'), count: cardHits.length },
              { value: 'folders', label: t('search.tabs.folders'), count: folderHits.length },
            ]}
          />
          {sets && cards && total === 0 && (
            <div className="mt-8">
              <EmptyState icon={<Search />} title={t('search.noResults')} description={t('search.noResultsHint')} action={<Link to="/create"><Button>{t('library.newSet')}</Button></Link>} />
            </div>
          )}

          {(tab === 'all' || tab === 'sets') && setHits.length > 0 && (
            <section className="mt-6" aria-label={t('search.tabs.sets')}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{t('search.tabs.sets')}</h2>
                {tab === 'all' && setHits.length > 6 && <button onClick={() => setTab('sets')} className="text-sm font-semibold text-primary hover:underline">{t('home.viewAll')}</button>}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(tab === 'all' ? setHits.slice(0, 6) : setHits).map((h) => (
                  <SetResult key={h.set.id} hit={h} q={q} cards={meta?.get(h.set.id)?.cards ?? 0} onPreview={() => setPreview(h.set)} onStudy={() => navigate(`/set/${h.set.id}`)} />
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'cards') && cardHits.length > 0 && (
            <section className="mt-8" aria-label={t('search.tabs.cards')}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{t('search.tabs.cards')}</h2>
                {tab === 'all' && cardHits.length > 8 && <button onClick={() => setTab('cards')} className="text-sm font-semibold text-primary hover:underline">{t('home.viewAll')}</button>}
              </div>
              <ul className="card mt-3 divide-y divide-border p-0">
                {(tab === 'all' ? cardHits.slice(0, 8) : cardHits).map((h) => (
                  <CardResult key={h.card.id} hit={h} q={q} />
                ))}
              </ul>
            </section>
          )}

          {(tab === 'all' || tab === 'folders') && folderHits.length > 0 && (
            <section className="mt-8" aria-label={t('search.tabs.folders')}>
              <h2 className="text-lg font-bold">{t('search.tabs.folders')}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {folderHits.map((h) => (
                  <Link key={h.folder.id} to={`/folders/${h.folder.id}`} className="card flex items-center gap-3 p-4 transition hover:shadow-pop">
                    <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${h.folder.color ?? '#6366f1'}22`, color: h.folder.color ?? '#6366f1' }}><FolderIcon size={18} /></span>
                    <Highlight text={h.folder.name} q={q} className="truncate font-semibold" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <PreviewModal set={preview} onClose={() => setPreview(null)} q={q} />
    </div>
  )
}

function SetResult({ hit, q, cards, onPreview, onStudy }: { hit: SetHit; q: string; cards: number; onPreview: () => void; onStudy: () => void }) {
  const { t } = useTranslation('library')
  const s = hit.set
  return (
    <div className="card flex flex-col p-4">
      <Link to={`/set/${s.id}`} className="font-semibold hover:text-primary"><Highlight text={s.title || t('library.untitled')} q={q} /></Link>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="primary">{t('common:common.terms', { count: cards })}</Badge>
        {s.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} tone="neutral"><Highlight text={`#${tag}`} q={q} /></Badge>
        ))}
      </div>
      {s.description && <p className="mt-2 line-clamp-2 text-sm text-muted"><Highlight text={s.description} q={q} /></p>}
      <div className="mt-auto flex gap-2 pt-4">
        <Button size="sm" variant="outline" leftIcon={<Eye size={14} />} onClick={onPreview} className="flex-1">{t('search.preview')}</Button>
        <Button size="sm" onClick={onStudy} className="flex-1">{t('search.study')}</Button>
      </div>
    </div>
  )
}

function CardResult({ hit, q }: { hit: CardHit; q: string }) {
  const { t } = useTranslation('library')
  const c = hit.card
  return (
    <li>
      <Link to={`/set/${c.setId}`} className="flex items-start gap-4 px-4 py-3 hover:bg-surface-2/60">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><BookOpen size={16} /></span>
        <div className="min-w-0 flex-1">
          <div className={cn('text-sm', hit.field === 'term' && 'font-semibold')}><Highlight text={c.term} q={q} /></div>
          <div className={cn('mt-0.5 text-sm text-muted', hit.field === 'definition' && 'font-medium text-text')}><Highlight text={c.definition} q={q} /></div>
          {hit.set && <div className="mt-1 text-xs text-faint">{t('search.inSet', { title: hit.set.title })}</div>}
        </div>
      </Link>
    </li>
  )
}

function PreviewModal({ set, onClose, q }: { set: StudySet | null; onClose: () => void; q: string }) {
  const { t } = useTranslation('library')
  const navigate = useNavigate()
  const cards = useLiveQuery(() => (set ? getCards(set.id) : Promise.resolve([] as Card[])), [set?.id])
  return (
    <Modal
      open={!!set}
      onClose={onClose}
      title={set?.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common:common.close')}</Button>
          <Button onClick={() => set && navigate(`/set/${set.id}`)}>{t('search.study')}</Button>
        </>
      }
    >
      {set?.description && <p className="mb-3 text-sm text-muted">{set.description}</p>}
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('search.previewTerms', { count: Math.min(5, cards?.length ?? 0), total: cards?.length ?? 0 })}</div>
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
        {cards?.slice(0, 5).map((c) => (
          <li key={c.id} className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-2 sm:gap-4">
            <span className="font-semibold">{q ? <Highlight text={c.term} q={q} /> : <Markdown src={c.term} />}</span>
            <span className="text-muted">{q ? <Highlight text={c.definition} q={q} /> : <Markdown src={c.definition} />}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
