import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ArrowLeftRight, Globe, Lock, Plus, Search, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import { createSet, getCards, replaceCards, updateSet } from '@/db/repo'
import type { LangPair, Side, Visibility } from '@/domain/types'
import { Button, Dropdown, Label, Modal, Select, Toggle, cn, toast } from '@/ui'
import { CardRow } from './CardRow'
import { ImportModal, type ImportMeta, type ImportedCard } from './ImportModal'
import { SearchBar } from './SearchBar'
import { ShortcutsPopover } from './ShortcutsPopover'
import { TagsInput } from './TagsInput'
import { detectLanguage } from './languages'
import { emptyCard, fromCard, isBlank, moveItem, savedAgo, swapSides, toNewCard, type EditorCard } from './editor-state'
import { makeSearchRegex, type SearchOptions } from './text-format'

const DRAFT_KEY = 'myquizz.editor.draft'
const SUGGEST_KEY = 'myquizz.editor.suggestions'

interface Focus {
  cardId: string
  side: Side
}

export default function EditorPage() {
  const { setId: routeSetId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation('editor')
  const editing = !!routeSetId

  const [setId, setSetId] = useState<string | undefined>(routeSetId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [lang, setLang] = useState<LangPair>({ term: '', definition: '' })
  const [cards, setCards] = useState<EditorCard[]>(() => [emptyCard(), emptyCard()])
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState(() => {
    try {
      return localStorage.getItem(SUGGEST_KEY) !== '0'
    } catch {
      return true
    }
  })
  const [focus, setFocus] = useState<Focus | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpts, setSearchOpts] = useState<SearchOptions>({ wholeWords: false, matchCase: false })
  const [matchIdx, setMatchIdx] = useState(0)
  const els = useRef(new Map<string, Partial<Record<Side, HTMLTextAreaElement | null>>>())
  const focusRef = useRef<Focus | null>(null)
  useEffect(() => {
    focusRef.current = focus
  }, [focus])

  const folders = useLiveQuery(() => db.folders.orderBy('name').toArray(), [])
  const recentLangs = useLiveQuery(async () => {
    const sets = await db.sets.orderBy('updatedAt').reverse().limit(50).toArray()
    return [...new Set(sets.flatMap((s) => [s.lang.term, s.lang.definition]).filter(Boolean))]
  }, [])

  // ---- load
  useEffect(() => {
    let alive = true
    void (async () => {
      let id = routeSetId
      if (!id) {
        try {
          const d = sessionStorage.getItem(DRAFT_KEY)
          if (d && (await db.sets.get(d))?.draft) id = d
        } catch {
          /* ignore */
        }
      }
      if (id) {
        const s = await db.sets.get(id)
        if (s && alive) {
          setSetId(id)
          setTitle(s.title)
          setDescription(s.description)
          setTags(s.tags)
          setFolderId(s.folderId ?? null)
          setVisibility(s.visibility)
          setLang(s.lang)
          const cs = (await getCards(id)).map(fromCard)
          setCards(cs.length ? cs : [emptyCard(), emptyCard()])
          setSavedAt(s.updatedAt)
        } else if (routeSetId && alive) {
          toast.error(t('notFound'))
          navigate('/library', { replace: true })
          return
        }
      }
      if (alive) setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [routeSetId, navigate, t])

  // ---- autosave
  const persist = useCallback(
    async (finalize = false): Promise<string | undefined> => {
      const nonBlank = cards.filter((c) => !isBlank(c))
      let id = setId
      const meta = { title: title.trim(), description: description.trim(), tags, folderId, visibility, lang }
      if (!id) {
        if (!meta.title && !nonBlank.length) return undefined
        const s = await createSet({ ...meta, draft: !finalize })
        id = s.id
        setSetId(id)
        try {
          sessionStorage.setItem(DRAFT_KEY, id)
        } catch {
          /* ignore */
        }
      } else {
        await updateSet(id, { ...meta, ...(finalize ? { draft: false } : {}) })
      }
      await replaceCards(id, nonBlank.map((c) => toNewCard(c, id!)))
      setSavedAt(Date.now())
      setDirty(false)
      return id
    },
    [cards, setId, title, description, tags, folderId, visibility, lang],
  )
  const persistRef = useRef(persist)
  useEffect(() => {
    persistRef.current = persist
  }, [persist])

  useEffect(() => {
    if (!loaded || !dirty) return
    const h = setTimeout(() => void persistRef.current().catch(() => toast.error(t('saveFailed'))), 900)
    return () => clearTimeout(h)
  }, [loaded, dirty, cards, title, description, tags, folderId, visibility, lang, t])

  useEffect(() => {
    const h = setInterval(() => setTick((x) => x + 1), 30_000)
    return () => clearInterval(h)
  }, [])

  const touch = () => setDirty(true)
  const updateCard = useCallback((id: string, patch: Partial<EditorCard>) => {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    if (!('expanded' in patch && Object.keys(patch).length === 1)) setDirty(true)
  }, [])

  const focusCard = (id: string, side: Side = 'term') => {
    requestAnimationFrame(() => els.current.get(id)?.[side]?.focus())
  }
  const addCard = useCallback((afterId?: string) => {
    const c = emptyCard()
    setCards((cs) => {
      const i = afterId ? cs.findIndex((x) => x.id === afterId) : -1
      const next = cs.slice()
      next.splice(i === -1 ? cs.length : i + 1, 0, c)
      return next
    })
    setDirty(true)
    focusCard(c.id)
  }, [])
  const deleteCard = (id: string) => {
    setCards((cs) => (cs.length > 1 ? cs.filter((c) => c.id !== id) : cs))
    setDirty(true)
  }
  const moveCard = useCallback((id: string, dir: -1 | 1) => {
    setCards((cs) => {
      const i = cs.findIndex((c) => c.id === id)
      return i === -1 ? cs : moveItem(cs, i, i + dir)
    })
    setDirty(true)
  }, [])

  // ---- keyboard shortcuts (page level)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const f = focusRef.current
      if (mod && e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault()
        addCard(f?.cardId)
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && f) {
        e.preventDefault()
        moveCard(f.cardId, e.key === 'ArrowUp' ? -1 : 1)
        focusCard(f.cardId, f.side)
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSuggestions((s) => !s)
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [addCard, moveCard])

  useEffect(() => {
    try {
      localStorage.setItem(SUGGEST_KEY, suggestions ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [suggestions])

  // ---- language detection
  const detected = useMemo<LangPair>(
    () => ({
      term: detectLanguage(cards.map((c) => c.cloze ?? c.term).join(' ')),
      definition: detectLanguage(cards.map((c) => c.definition).join(' ')),
    }),
    [cards],
  )

  // ---- search
  const regex = useMemo(() => makeSearchRegex(query, searchOpts), [query, searchOpts])
  const matches = useMemo(
    () => (regex ? cards.filter((c) => [c.term, c.definition, c.hint, c.cloze ?? ''].some((s) => regex.test(s))).map((c) => c.id) : []),
    [cards, regex],
  )
  useEffect(() => {
    const id = matches[matchIdx]
    if (id) document.querySelector(`[data-card-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [matches, matchIdx])

  // ---- dnd
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setCards((cs) => arrayMove(cs, cs.findIndex((c) => c.id === active.id), cs.findIndex((c) => c.id === over.id)))
    setDirty(true)
  }

  // ---- actions
  const onImport = (imported: ImportedCard[], meta?: ImportMeta) => {
    setCards((cs) => {
      const kept = cs.filter((c) => !isBlank(c))
      const added = imported.map((ic) => ({ ...emptyCard(), term: ic.term, definition: ic.definition, hint: ic.hint ?? '', cloze: ic.cloze ?? null, image: ic.image ?? {} }))
      return [...kept, ...added]
    })
    if (meta) {
      if (meta.title && !title.trim()) setTitle(meta.title)
      if (meta.description && !description.trim()) setDescription(meta.description)
      if (meta.lang && !lang.term && !lang.definition) setLang(meta.lang)
      if (meta.tags?.length) setTags((tg) => [...new Set([...tg, ...meta.tags!])])
    }
    setDirty(true)
    toast.success(t('import.done', { count: imported.length }))
  }
  const swapAll = () => {
    setCards((cs) => cs.map(swapSides))
    setLang((l) => ({ term: l.definition, definition: l.term }))
    setDirty(true)
  }
  const deleteAll = () => {
    setCards([emptyCard(), emptyCard()])
    setConfirmDelete(false)
    setDirty(true)
  }
  const finish = async (practice: boolean) => {
    const nonBlank = cards.filter((c) => !isBlank(c))
    if (!title.trim()) {
      toast.error(t('validation.title'))
      document.getElementById('set-title')?.focus()
      return
    }
    if (nonBlank.length < 2) {
      toast.error(t('validation.cards'))
      return
    }
    setSaving(true)
    try {
      const id = await persist(true)
      if (!id) return
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        /* ignore */
      }
      toast.success(editing ? t('savedToast') : t('created'))
      navigate(practice ? `/set/${id}/flashcards` : `/set/${id}`)
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const ago = savedAgo(savedAt)
  const savedLabel = ago ? (ago.key === 'justNow' ? t('saved.justNow') : ago.key === 'underMinute' ? t('saved.underMinute') : ago.key === 'minutes' ? t('saved.minutes', { count: ago.count }) : t('saved.hours', { count: ago.count })) : null

  if (!loaded) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl pb-24">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{editing ? t('titleEdit') : t('titleCreate')}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Dropdown
              align="left"
              trigger={
                <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-text hover:bg-border/70">
                  {visibility === 'private' ? <Lock size={13} /> : <Globe size={13} />}
                  {t(`visibility.${visibility}`)}
                </button>
              }
              items={[
                { label: t('visibility.private'), icon: <Lock size={15} />, onSelect: () => (setVisibility('private'), touch()) },
                { label: t('visibility.password'), icon: <Globe size={15} />, onSelect: () => (setVisibility('password'), touch()) },
              ]}
            />
            {savedLabel && <span aria-live="polite">{dirty ? t('saved.pending') : savedLabel}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void finish(false)} loading={saving}>
            {editing ? t('actions.save') : t('actions.create')}
          </Button>
          <Button onClick={() => void finish(true)} loading={saving}>
            {editing ? t('actions.saveAndPractice') : t('actions.createAndPractice')}
          </Button>
        </div>
      </div>
      {visibility === 'password' && <p className="mt-2 text-xs text-muted">{t('visibility.passwordHelp')}</p>}

      {/* Title / description */}
      <div className="mt-5 space-y-3">
        <input
          id="set-title"
          value={title}
          onChange={(e) => (setTitle(e.target.value), touch())}
          placeholder={t('fields.title')}
          aria-label={t('fields.title')}
          className="h-14 w-full rounded-xl border border-border bg-surface px-4 text-lg font-semibold placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <textarea
          value={description}
          onChange={(e) => (setDescription(e.target.value), touch())}
          placeholder={t('fields.description')}
          aria-label={t('fields.description')}
          rows={2}
          className="w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <div>
            <Label htmlFor="set-folder">{t('fields.folder')}</Label>
            <Select id="set-folder" value={folderId ?? ''} onChange={(e) => (setFolderId(e.target.value || null), touch())}>
              <option value="">{t('fields.noFolder')}</option>
              {folders?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('fields.tags')}</Label>
            <TagsInput value={tags} onChange={(v) => (setTags(v), touch())} placeholder={t('fields.tagsPlaceholder')} label={t('fields.tags')} />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button variant="secondary" leftIcon={<Plus size={16} />} onClick={() => setImportOpen(true)}>
          {t('toolbar.import')}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <span className="hidden sm:inline">{t('toolbar.suggestions')}</span>
            <Toggle checked={suggestions} onChange={setSuggestions} id="suggestions-toggle" />
          </label>
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            aria-pressed={searchOpen}
            aria-label={t('toolbar.search')}
            title={`${t('toolbar.search')} (Ctrl+Shift+F)`}
            className={cn('grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-muted hover:bg-surface-2 hover:text-text', searchOpen && 'bg-primary-soft text-primary')}
          >
            <Search size={18} />
          </button>
          <button type="button" onClick={swapAll} aria-label={t('toolbar.swap')} title={t('toolbar.swap')} className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-muted hover:bg-surface-2 hover:text-text">
            <ArrowLeftRight size={18} />
          </button>
          <ShortcutsPopover />
          <button type="button" onClick={() => setConfirmDelete(true)} aria-label={t('toolbar.deleteAll')} title={t('toolbar.deleteAll')} className="grid h-10 w-10 place-items-center rounded-full bg-error text-white hover:brightness-95">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Cards */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="mt-4 space-y-4">
            {cards.map((c, i) => (
              <CardRow
                key={c.id}
                card={c}
                index={i}
                setId={setId}
                lang={lang}
                detected={detected}
                onLang={(side, code) => (setLang((l) => ({ ...l, [side]: code })), touch())}
                recentLangs={recentLangs ?? []}
                suggestionsEnabled={suggestions}
                focusedSide={focus?.cardId === c.id ? focus.side : null}
                onFocus={(side) => setFocus({ cardId: c.id, side })}
                onBlur={() => setFocus((f) => (f?.cardId === c.id ? null : f))}
                onChange={(patch) => updateCard(c.id, patch)}
                onDelete={() => deleteCard(c.id)}
                canDelete={cards.length > 1}
                registerEl={(side, el) => {
                  const m = els.current.get(c.id) ?? {}
                  m[side] = el
                  els.current.set(c.id, m)
                }}
                isMatch={matches.includes(c.id)}
                isActiveMatch={matches[matchIdx] === c.id}
                dimmed={!!regex && matches.length > 0 && !matches.includes(c.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-6 flex justify-center">
        {/* Keep focus in the textarea on mousedown: blurring collapses the formatting toolbar, which would shift this button away before mouseup and swallow the click. */}
        <Button variant="secondary" size="lg" leftIcon={<Plus size={18} />} onMouseDown={(e) => e.preventDefault()} onClick={() => addCard()}>
          {t('addCard')}
        </Button>
      </div>

      <SearchBar
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false)
          setQuery('')
        }}
        query={query}
        onQuery={(q) => {
          setQuery(q)
          setMatchIdx(0)
        }}
        options={searchOpts}
        onOptions={(o) => {
          setSearchOpts(o)
          setMatchIdx(0)
        }}
        matchCount={matches.length}
        current={matchIdx}
        onPrev={() => setMatchIdx((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0))}
        onNext={() => setMatchIdx((i) => (matches.length ? (i + 1) % matches.length : 0))}
      />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={onImport} />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
        title={t('deleteAll.title')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('common:common.cancel')}
            </Button>
            <Button variant="danger" onClick={deleteAll}>
              {t('deleteAll.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('deleteAll.body', { count: cards.filter((c) => !isBlank(c)).length })}</p>
      </Modal>
    </div>
  )
}
