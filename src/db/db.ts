import Dexie, { type EntityTable } from 'dexie'
import type {
  Achievement,
  Card,
  Folder,
  MediaItem,
  Notification,
  Progress,
  RevlogEntry,
  Session,
  Streak,
  StudySet,
} from '@/domain/types'

export interface KV {
  key: string
  value: unknown
}

export interface GameScore {
  id: string // `${setId}:${game}`
  setId: string
  game: string
  best: number // score or best time (ms) depending on game
  plays: number
  updatedAt: number
}

export class MyQuizzDB extends Dexie {
  sets!: EntityTable<StudySet, 'id'>
  cards!: EntityTable<Card, 'id'>
  media!: EntityTable<MediaItem, 'id'>
  folders!: EntityTable<Folder, 'id'>
  progress!: EntityTable<Progress, 'id'>
  revlog!: EntityTable<RevlogEntry, 'id'>
  sessions!: EntityTable<Session, 'id'>
  kv!: EntityTable<KV, 'key'>
  achievements!: EntityTable<Achievement, 'id'>
  streak!: EntityTable<Streak, 'id'>
  notifications!: EntityTable<Notification, 'id'>
  scores!: EntityTable<GameScore, 'id'>

  constructor(name = 'myquizz') {
    super(name)
    this.version(1).stores({
      sets: 'id, title, folderId, updatedAt, createdAt, lastStudiedAt, externalId, *tags',
      cards: 'id, setId, [setId+position], position, starred, updatedAt',
      media: 'id, createdAt',
      folders: 'id, name, parentId, updatedAt',
      progress: 'id, cardId, setId, variant, [setId+variant], fsrs.due, bucket, updatedAt',
      revlog: '++id, cardId, setId, ts, mode',
      sessions: 'id, setId, mode, startedAt',
      kv: 'key',
      achievements: 'id, unlockedAt',
      streak: 'id',
      notifications: 'id, createdAt, read',
      scores: 'id, setId, game, updatedAt',
    })
  }
}

export const db = new MyQuizzDB()

/** Ask the browser to keep our storage (prevents eviction on low disk). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch {
    /* ignore */
  }
  return false
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    if (e) return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
  } catch {
    /* ignore */
  }
  return null
}
