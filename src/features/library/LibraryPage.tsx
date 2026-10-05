import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDownAZ, BookOpen, Check, ChevronDown, Clock, Folder as FolderIcon, FolderInput, FolderPlus, Import, Plus, Search, Trash2, X } from 'lucide-react'
import { db } from '@/db/db'
import { deleteSet, duplicateSet } from '@/db/repo'
import type { StudySet } from '@/domain/types'
import { Button, Dropdown, EmptyState, Input, Tabs, cn, toast } from '@/ui'
import { useStudyTracker } from '@/features/achievements'
import { OfflineIndicator } from '@/features/pwa'
import { SetCard } from './SetCard'
import { NewFolderDialog } from './NewFolderDialog'
import { SaveToFolderModal } from './SaveToFolderModal'
import { ConfirmDialog } from './ConfirmDialog'
import { RECENCY_ORDER, recencyGroup, timeAgo, type RecencyGroup } from './format'
import { matchesQuery, useFolderMap, useFolders, useSetMeta, useSets } from './useLibraryData'

type Tab = 'sets' | 'folders' | 'activities' | 'drafts'
type Sort = 'recent' | 'alpha' | 'created' | 'studied'
const TABS: Tab[] = ['sets', 'folders', 'activities', 'drafts']
const SORTS: Sort[] = ['recent', 'alpha', 'created', 'studied']
const SORT_KEY = 'myquizz.librarySort'

function sortSets(sets: StudySet[], sort: Sort): StudySet[] {
  const out = [...sets]
  switch (sort) {
    case 'alpha':
      return out.sort((a, b) => a.title.localeCompare(b.title))
    case 'created':
      return out.sort((a, b) => b.createdAt - a.createdAt)
    case 'studied':
      return out.sort((a, b) => (b.lastStudiedAt ?? 0) - (a.lastStudiedAt ?? 0) || b.updatedAt - a.updatedAt)
    default:
      return out.sort((a, b) => Math.max(b.updatedAt, b.lastStudiedAt ?? 0) - Math.max(a.updatedAt, a.lastStudiedAt ?? 0))
  }
}

function groupKeyFor(set: StudySet, sort: Sort): number {
  if (sort === 'created') return set.createdAt
  if (sort === 'studied') return set.lastStudiedAt ?? 0
  return Math.max(set.updatedAt, set.lastStudiedAt ?? 0)
}

export default function LibraryPage() {
  useStudyTracker()
  const { t, i18n } = useTranslation('library')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'sets'
  const setTab = (v: Tab) => setParams((p) => { p.set('tab', v); return p }, { replace: true })
  const [sort, setSort] = useState<Sort>(() => {
    try { const v = localStorage.getItem(SORT_KEY) as Sort | null; return v && SORTS.includes(v) ? v : 'recent' } catch { return 'recent' }
  })
  useEffect(() => { try { localStorage.setItem(SORT_KEY, sort) } catch { /* ignore */ } }, [sort])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moveIds, setMoveIds] = useState<string[] | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const newFolder = params.get('new') === 'folder'
  const closeNewFolder = () => setParams((p) => { p.delete('new'); return p }, { replace: true })

  const sets = useSets()
  const meta = useSetMeta()
  const folders = useFolders()
  const folderMap = useFolderMap()
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().limit(50).toArray(), [])

  const visible = useMemo(() => {
    if (!sets) return []
    const base = sets.filter((s) => (tab === 'drafts' ? s.draft : !s.draft) && matchesQuery(s, query))
    return sortSets(base, sort)
  }, [sets, tab, query, sort])

  const groups = useMemo(() => {
    const m = new Map<RecencyGroup, StudySet[]>()
    for (const s of visible) {
      const g = sort === 'alpha' ? 'earlier' : recencyGroup(groupKeyFor(s, sort))
      m.set(g, [...(m.get(g) ?? []), s])
    }
    return RECENCY_ORDER.filter((g) => m.has(g)).map((g) => ({ group: g, sets: m.get(g)! }))
  }, [visible, sort])

  const toggleSelect = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selecting = selected.size > 0
  const allSelected = visible.length > 0 && visible.every((s) => selected.has(s.id))

  const doDelete = async () => {
    if (!deleteIds) return
    setBusy(true)
    try {
      for (const id of deleteIds) await deleteSet(id)
      toast.success(t('library.deleted', { count: deleteIds.length }))
      setSelected(new Set())
      setDeleteIds(null)
    } finally { setBusy(false) }
  }
  const doDuplicate = async (id: string) => {
    const copy = await duplicateSet(id)
    if (copy) toast.success(t('library.duplicated'), { action: { label: t('library.open'), onClick: () => navigate(`/set/${copy.id}`) } })
  }

  const folderCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sets ?? []) if (s.folderId) m.set(s.folderId, (m.get(s.folderId) ?? 0) + 1)
    return m
  }, [sets])

  const draftCount = sets?.filter((s) => s.draft).length ?? 0
  const setCount = sets?.filter((s) => !s.draft).length ?? 0

  return (
    <div className="mx-auto max-w-5xl">
      <OfflineIndicator />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('library.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('library.subtitle', { sets: setCount, folders: folders?.length ?? 0 })}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/import"><Button variant="outline" leftIcon={<Import size={16} />}>{t('common:common.import')}</Button></Link>
          <Link to="/create"><Button leftIcon={<Plus size={16} />}>{t('library.newSet')}</Button></Link>
        </div>
      </div>

      <Tabs
        className="mt-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'sets', label: t('library.tabs.sets'), count: setCount },
          { value: 'folders', label: t('library.tabs.folders'), count: folders?.length },
          { value: 'activities', label: t('library.tabs.activities') },
          { value: 'drafts', label: t('library.tabs.drafts'), count: draftCount || undefined },
        ]}
      />

      {(tab === 'sets' || tab === 'drafts') && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Dropdown
              align="left"
              trigger={
                <button className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2">
                  {sort === 'alpha' ? <ArrowDownAZ size={16} /> : <Clock size={16} />}
                  {t(`library.sort.${sort}`)}
                  <ChevronDown size={14} className="text-muted" />
                </button>
              }
              items={SORTS.map((s) => ({ label: t(`library.sort.${s}`), icon: sort === s ? <Check size={16} /> : <span className="inline-block w-4" />, onSelect: () => setSort(s) }))}
            />
            <div className="relative ml-auto w-full sm:w-72">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('library.searchPlaceholder')} className="h-10 rounded-full pl-10" aria-label={t('library.searchPlaceholder')} />
              {query && <button onClick={() => setQuery('')} aria-label={t('common:common.close')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"><X size={14} /></button>}
            </div>
          </div>

          {visible.length > 0 && (
            <div className="mt-4 flex items-center gap-3 text-sm">
              <button
                type="button"
                role="checkbox"
                aria-checked={allSelected}
                onClick={() => setSelected(allSelected ? new Set() : new Set(visible.map((s) => s.id)))}
                className={cn('grid h-5 w-5 place-items-center rounded-md border transition', allSelected ? 'border-primary bg-primary text-white' : 'border-border bg-surface hover:border-primary')}
              >
                {allSelected && <Check size={13} />}
              </button>
              <span className="text-muted">{selecting ? t('library.selectedCount', { count: selected.size }) : t('library.selectAll')}</span>
              {selecting && (
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" leftIcon={<FolderInput size={15} />} onClick={() => setMoveIds([...selected])}>{t('library.moveToFolder')}</Button>
                  <Button size="sm" variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setDeleteIds([...selected])}>{t('common:common.delete')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('common:common.cancel')}</Button>
                </div>
              )}
            </div>
          )}

          {sets && visible.length === 0 && (
            <div className="mt-8">
              {query ? (
                <EmptyState icon={<Search />} title={t('library.noResults')} description={t('library.noResultsHint', { query })} action={<Button variant="secondary" onClick={() => setQuery('')}>{t('library.clearSearch')}</Button>} />
              ) : tab === 'drafts' ? (
                <EmptyState icon={<BookOpen />} title={t('library.noDrafts')} description={t('library.noDraftsHint')} />
              ) : (
                <EmptyState
                  icon={<BookOpen />}
                  title={t('library.emptyTitle')}
                  description={t('library.emptyBody')}
                  action={
                    <div className="flex gap-2">
                      <Link to="/create"><Button leftIcon={<Plus size={16} />}>{t('library.newSet')}</Button></Link>
                      <Link to="/import"><Button variant="outline" leftIcon={<Import size={16} />}>{t('common:common.import')}</Button></Link>
                    </div>
                  }
                />
              )}
            </div>
          )}

          <div className="mt-2 space-y-6">
            {groups.map(({ group, sets: list }) => (
              <section key={group} aria-label={t(`library.groups.${group}`)}>
                {sort !== 'alpha' && (
                  <div className="mb-2 flex items-center gap-3">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted">{t(`library.groups.${group}`)}</h2>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className="space-y-3">
                  {list.map((s) => (
                    <SetCard
                      key={s.id}
                      set={s}
                      meta={meta?.get(s.id)}
                      folder={s.folderId ? folderMap.get(s.folderId) : undefined}
                      selectable
                      selected={selected.has(s.id)}
                      onToggleSelect={toggleSelect}
                      onMove={(id) => setMoveIds([id])}
                      onDuplicate={(id) => void doDuplicate(id)}
                      onDelete={(id) => setDeleteIds([id])}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {tab === 'folders' && (
        <div className="mt-5">
          <div className="flex justify-end">
            <Button variant="outline" leftIcon={<FolderPlus size={16} />} onClick={() => setParams((p) => { p.set('new', 'folder'); return p })}>{t('folders.new')}</Button>
          </div>
          {folders && folders.length === 0 && (
            <div className="mt-6"><EmptyState icon={<FolderIcon />} title={t('folders.emptyTitle')} description={t('folders.emptyBody')} /></div>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {folders?.map((f) => (
              <Link key={f.id} to={`/folders/${f.id}`} className="card flex items-center gap-3 p-4 transition hover:shadow-pop">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `${f.color ?? '#6366f1'}22`, color: f.color ?? '#6366f1' }}>
                  <FolderIcon size={20} />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{f.name}</div>
                  <div className="text-xs text-muted">{t('folders.setCount', { count: folderCounts.get(f.id) ?? 0 })}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tab === 'activities' && (
        <div className="mt-5">
          {sessions && sessions.length === 0 && <EmptyState icon={<Clock />} title={t('library.noActivity')} description={t('library.noActivityHint')} />}
          <ul className="space-y-2">
            {sessions?.map((s) => {
              const set = sets?.find((x) => x.id === s.setId)
              const pct = s.score !== undefined && s.total ? Math.round((s.score / s.total) * 100) : s.score !== undefined && s.score <= 1 ? Math.round(s.score * 100) : null
              return (
                <li key={s.id}>
                  <Link to={set ? `/set/${s.setId}` : '/library'} className="card flex items-center gap-4 p-3.5 transition hover:shadow-pop">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Clock size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{set?.title ?? t('library.deletedSet')}</div>
                      <div className="text-xs text-muted">
                        {t(`common:modes.${s.mode}`)} · {timeAgo(s.startedAt, i18n.language)}
                        {s.answers.length > 0 && ` · ${t('library.answers', { count: s.answers.length })}`}
                      </div>
                    </div>
                    {pct !== null && <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', pct >= 80 ? 'bg-accent-soft text-accent' : pct >= 50 ? 'bg-highlight-soft text-highlight' : 'bg-error-soft text-error')}>{pct}%</span>}
                    {pct === null && s.score !== undefined && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">{Math.round(s.score)}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <NewFolderDialog open={newFolder} onClose={closeNewFolder} onCreated={(f) => navigate(`/folders/${f.id}`)} />
      <SaveToFolderModal open={!!moveIds} onClose={() => { setMoveIds(null); setSelected(new Set()) }} setId={moveIds ?? []} />
      <ConfirmDialog
        open={!!deleteIds}
        onClose={() => setDeleteIds(null)}
        onConfirm={() => void doDelete()}
        busy={busy}
        title={t('library.deleteTitle', { count: deleteIds?.length ?? 1 })}
        body={t('library.deleteBody')}
      />
    </div>
  )
}
