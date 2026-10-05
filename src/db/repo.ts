/**
 * Repository helpers. Features should use these instead of touching Dexie tables directly
 * where a helper exists, so that side effects (updatedAt, positions, progress cleanup) stay consistent.
 */
import { db } from './db'
import { newId, now } from '@/domain/id'
import type {
  Card,
  Folder,
  MediaItem,
  Progress,
  RevlogEntry,
  Session,
  Settings,
  StudySet,
  Variant,
} from '@/domain/types'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { emptyFsrsState, progressId } from '@/domain/srs'

// ---------- Settings ----------
const SETTINGS_KEY = 'settings'

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get(SETTINGS_KEY)
  const stored = (row?.value as Partial<Settings> | undefined) ?? {}
  return deepMerge(DEFAULT_SETTINGS, stored)
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next = deepMerge(current, patch)
  await db.kv.put({ key: SETTINGS_KEY, value: next })
  return next
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch ?? {})) {
    const b = out[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = deepMerge(b, v as never)
    } else if (v !== undefined) out[k] = v
  }
  return out as T
}

// ---------- Sets ----------
export type NewSet = Partial<StudySet> & { title: string }

export async function createSet(input: NewSet): Promise<StudySet> {
  const t = now()
  const set: StudySet = {
    id: input.id ?? newId(),
    title: input.title,
    description: input.description ?? '',
    folderId: input.folderId ?? null,
    tags: input.tags ?? [],
    lang: input.lang ?? { term: '', definition: '' },
    cardTypes: input.cardTypes ?? ['basic'],
    visibility: input.visibility ?? 'private',
    author: input.author,
    externalId: input.externalId,
    draft: input.draft ?? false,
    createdAt: input.createdAt ?? t,
    updatedAt: t,
  }
  await db.sets.put(set)
  return set
}

export async function updateSet(id: string, patch: Partial<StudySet>): Promise<void> {
  await db.sets.update(id, { ...patch, updatedAt: now() })
}

export async function deleteSet(id: string): Promise<void> {
  await db.transaction('rw', [db.sets, db.cards, db.progress, db.revlog, db.sessions, db.scores, db.media], async () => {
    const cards = await db.cards.where('setId').equals(id).toArray()
    const mediaIds = new Set<string>()
    for (const c of cards) {
      if (c.image?.term) mediaIds.add(c.image.term)
      if (c.image?.definition) mediaIds.add(c.image.definition)
      if (c.audio?.term) mediaIds.add(c.audio.term)
      if (c.audio?.definition) mediaIds.add(c.audio.definition)
      if (c.occlusion?.imageId) mediaIds.add(c.occlusion.imageId)
    }
    await db.cards.where('setId').equals(id).delete()
    await db.progress.where('setId').equals(id).delete()
    await db.revlog.where('setId').equals(id).delete()
    await db.sessions.where('setId').equals(id).delete()
    await db.scores.where('setId').equals(id).delete()
    await db.sets.delete(id)
    // Delete media that is no longer referenced by any card.
    for (const m of mediaIds) {
      const stillUsed = await db.cards.filter((c) => JSON.stringify(c).includes(m)).count()
      if (!stillUsed) await db.media.delete(m)
    }
  })
}

export async function duplicateSet(id: string): Promise<StudySet | undefined> {
  const src = await db.sets.get(id)
  if (!src) return undefined
  const cards = await getCards(id)
  const copy = await createSet({ ...src, id: undefined, title: `${src.title} (kopie)`, externalId: undefined })
  await db.cards.bulkPut(
    cards.map((c) => ({ ...c, id: newId(), setId: copy.id, createdAt: now(), updatedAt: now() })),
  )
  return copy
}

export async function touchStudied(setId: string): Promise<void> {
  await db.sets.update(setId, { lastStudiedAt: now() })
}

// ---------- Cards ----------
export async function getCards(setId: string): Promise<Card[]> {
  return db.cards.where('[setId+position]').between([setId, Dexie_minKey], [setId, Dexie_maxKey]).toArray()
}
const Dexie_minKey = -Infinity
const Dexie_maxKey = Infinity

export type NewCard = Partial<Card> & { setId: string; term: string; definition: string }

export function buildCard(input: NewCard, position: number): Card {
  const t = now()
  return {
    id: input.id ?? newId(),
    setId: input.setId,
    position,
    term: input.term,
    definition: input.definition,
    hint: input.hint,
    mnemonic: input.mnemonic,
    example: input.example,
    altAnswers: input.altAnswers,
    distractors: input.distractors,
    image: input.image,
    audio: input.audio,
    cloze: input.cloze ?? null,
    occlusion: input.occlusion ?? null,
    starred: input.starred ?? false,
    suspended: input.suspended ?? false,
    flag: input.flag ?? null,
    leech: input.leech ?? false,
    createdAt: input.createdAt ?? t,
    updatedAt: t,
  }
}

export async function replaceCards(setId: string, inputs: NewCard[]): Promise<Card[]> {
  const cards = inputs.map((c, i) => buildCard({ ...c, setId }, i))
  await db.transaction('rw', [db.cards, db.sets], async () => {
    const existing = await db.cards.where('setId').equals(setId).primaryKeys()
    const keep = new Set(cards.map((c) => c.id))
    await db.cards.bulkDelete(existing.filter((id) => !keep.has(id)))
    await db.cards.bulkPut(cards)
    await db.sets.update(setId, { updatedAt: now() })
  })
  return cards
}

export async function addCards(setId: string, inputs: NewCard[]): Promise<Card[]> {
  const count = await db.cards.where('setId').equals(setId).count()
  const cards = inputs.map((c, i) => buildCard({ ...c, setId }, count + i))
  await db.cards.bulkPut(cards)
  await db.sets.update(setId, { updatedAt: now() })
  return cards
}

export async function updateCard(id: string, patch: Partial<Card>): Promise<void> {
  await db.cards.update(id, { ...patch, updatedAt: now() })
}

export async function toggleStar(id: string): Promise<boolean> {
  const c = await db.cards.get(id)
  if (!c) return false
  await db.cards.update(id, { starred: !c.starred })
  return !c.starred
}

// ---------- Media ----------
export async function putMedia(blob: Blob, meta: Partial<MediaItem> = {}): Promise<MediaItem> {
  const item: MediaItem = { id: meta.id ?? newId(), mime: blob.type || meta.mime || 'application/octet-stream', blob, width: meta.width, height: meta.height, createdAt: now() }
  await db.media.put(item)
  return item
}

const urlCache = new Map<string, string>()
/** Object URL for a media id (cached for the page lifetime). */
export async function mediaUrl(id: string | undefined | null): Promise<string | undefined> {
  if (!id) return undefined
  const cached = urlCache.get(id)
  if (cached) return cached
  const m = await db.media.get(id)
  if (!m) return undefined
  const url = URL.createObjectURL(m.blob)
  urlCache.set(id, url)
  return url
}

// ---------- Folders ----------
export async function createFolder(name: string, parentId: string | null = null, color?: string): Promise<Folder> {
  const t = now()
  const f: Folder = { id: newId(), name, parentId, color, createdAt: t, updatedAt: t }
  await db.folders.put(f)
  return f
}

export async function deleteFolder(id: string): Promise<void> {
  await db.transaction('rw', [db.folders, db.sets], async () => {
    await db.sets.where('folderId').equals(id).modify({ folderId: null })
    await db.folders.where('parentId').equals(id).modify({ parentId: null })
    await db.folders.delete(id)
  })
}

// ---------- Progress & revlog ----------
export async function getOrCreateProgress(card: Card, variant: Variant = 'forward'): Promise<Progress> {
  const id = progressId(card.id, variant)
  const existing = await db.progress.get(id)
  if (existing) return existing
  const p: Progress = {
    id,
    cardId: card.id,
    setId: card.setId,
    variant,
    fsrs: emptyFsrsState(),
    bucket: 'new',
    correct: 0,
    incorrect: 0,
    updatedAt: now(),
  }
  await db.progress.put(p)
  return p
}

export async function getSetProgress(setId: string, variant: Variant = 'forward'): Promise<Progress[]> {
  return db.progress.where('[setId+variant]').equals([setId, variant]).toArray()
}

export async function saveProgress(p: Progress): Promise<void> {
  await db.progress.put({ ...p, updatedAt: now() })
}

export async function logReview(entry: Omit<RevlogEntry, 'id' | 'ts'> & { ts?: number }): Promise<void> {
  await db.revlog.add({ ...entry, ts: entry.ts ?? now() })
}

/** Record a simple correct/incorrect outcome outside SRS (learn/write/test/games). */
export async function recordOutcome(card: Card, correct: boolean, mode: RevlogEntry['mode'], variant: Variant = 'forward', durationMs = 0): Promise<Progress> {
  const p = await getOrCreateProgress(card, variant)
  const next: Progress = {
    ...p,
    correct: p.correct + (correct ? 1 : 0),
    incorrect: p.incorrect + (correct ? 0 : 1),
    lastMode: mode,
  }
  if (next.bucket === 'new') next.bucket = 'learning'
  if (next.bucket === 'learning' && correct && next.correct >= 2 && next.correct > next.incorrect) next.bucket = 'known'
  if (!correct && next.bucket === 'known') next.bucket = 'learning'
  if (correct && next.correct >= 5 && next.incorrect === 0) next.bucket = 'mastered'
  await saveProgress(next)
  await logReview({
    cardId: card.id,
    setId: card.setId,
    variant,
    rating: correct ? 3 : 1,
    state: next.fsrs.state,
    scheduledDays: 0,
    elapsedDays: 0,
    durationMs,
    mode,
  })
  return next
}

export async function resetSetProgress(setId: string): Promise<void> {
  await db.progress.where('setId').equals(setId).delete()
}

// ---------- Sessions ----------
export async function startSession(setId: string, mode: Session['mode'], settings?: Record<string, unknown>): Promise<Session> {
  const s: Session = { id: newId(), setId, mode, startedAt: now(), answers: [], settings }
  await db.sessions.put(s)
  await touchStudied(setId)
  return s
}

export async function finishSession(s: Session, patch: Partial<Session> = {}): Promise<Session> {
  const done = { ...s, ...patch, finishedAt: now() }
  await db.sessions.put(done)
  return done
}

// ---------- Scores ----------
export async function recordScore(setId: string, game: string, value: number, lowerIsBetter = false): Promise<{ best: number; isNewBest: boolean }> {
  const id = `${setId}:${game}`
  const cur = await db.scores.get(id)
  const isNewBest = !cur || (lowerIsBetter ? value < cur.best : value > cur.best)
  const best = isNewBest ? value : cur!.best
  await db.scores.put({ id, setId, game, best, plays: (cur?.plays ?? 0) + 1, updatedAt: now() })
  return { best, isNewBest }
}

export async function getScore(setId: string, game: string): Promise<GameScoreLite | undefined> {
  const s = await db.scores.get(`${setId}:${game}`)
  return s ? { best: s.best, plays: s.plays } : undefined
}
export interface GameScoreLite { best: number; plays: number }

// ---------- Danger zone ----------
export async function wipeAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
}
