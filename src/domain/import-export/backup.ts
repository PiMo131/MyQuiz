/**
 * Full backup (ZIP via fflate: backup.json + media/<id>.<ext>) and restore (merge or replace).
 * Optional passphrase encryption wraps the whole ZIP (see crypto.ts).
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { db } from '@/db/db'
import { getSettings, saveSettings } from '@/db/repo'
import type { Backup, Card, Folder, MediaItem, Progress, RevlogEntry, Session, Streak, StudySet } from '@/domain/types'
import { APP_VERSION } from '@/domain/types'
import { dataUrlToBlob } from './exporters'
import { decryptBytes, encryptBytes, isEncrypted } from './crypto'
import { blobToBytes, extFor, mimeForExt } from './files'

export type BackupPhase = 'collect' | 'media' | 'zip' | 'encrypt' | 'read' | 'decrypt' | 'write' | 'done'
export interface BackupProgress {
  phase: BackupPhase
  done: number
  total: number
}
export type ProgressFn = (p: BackupProgress) => void

export interface BackupBundle {
  backup: Backup
  /** Media blobs keyed by media id (from zip files or data URLs). */
  media: Map<string, Blob>
}

export function isBackup(x: unknown): x is Backup {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return o.format === 'myquizz-backup' && Array.isArray(o.sets) && Array.isArray(o.cards)
}

/** Read every table into a Backup object. Media is returned separately (as blobs) so the caller chooses the container. */
export async function collectBackup(onProgress?: ProgressFn): Promise<BackupBundle> {
  onProgress?.({ phase: 'collect', done: 0, total: 1 })
  const [settings, folders, sets, cards, progress, revlog, sessions, achievements, streak, mediaItems] = await Promise.all([
    getSettings(),
    db.folders.toArray(),
    db.sets.toArray(),
    db.cards.toArray(),
    db.progress.toArray(),
    db.revlog.toArray(),
    db.sessions.toArray(),
    db.achievements.toArray(),
    db.streak.get('streak'),
    db.media.toArray(),
  ])
  const media = new Map<string, Blob>()
  const mediaRefs: NonNullable<Backup['media']> = []
  for (const m of mediaItems) {
    // Guard against environments where IndexedDB cannot round-trip Blobs.
    if (!m.blob || typeof (m.blob as Blob).size !== 'number') continue
    media.set(m.id, m.blob)
    mediaRefs.push({ id: m.id, mime: m.mime, file: `media/${m.id}.${extFor(m.mime)}` })
  }
  const backup: Backup = {
    format: 'myquizz-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    app: { version: APP_VERSION },
    settings,
    folders,
    sets,
    cards,
    media: mediaRefs,
    progress,
    revlog,
    sessions,
    achievements,
    streak: streak ?? undefined,
  }
  onProgress?.({ phase: 'collect', done: 1, total: 1 })
  return { backup, media }
}

/** Pack a bundle into ZIP bytes (optionally encrypted with a passphrase). */
export async function bundleToZip(bundle: BackupBundle, opts: { passphrase?: string; onProgress?: ProgressFn } = {}): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const total = bundle.media.size
  let done = 0
  for (const ref of bundle.backup.media ?? []) {
    const blob = bundle.media.get(ref.id)
    if (blob && ref.file) {
      files[ref.file] = await blobToBytes(blob)
    }
    opts.onProgress?.({ phase: 'media', done: ++done, total })
  }
  files['backup.json'] = strToU8(JSON.stringify(bundle.backup))
  opts.onProgress?.({ phase: 'zip', done: 0, total: 1 })
  // media is already compressed (webp/jpg); only compress the JSON.
  const zippable: Zippable = {}
  for (const [k, v] of Object.entries(files)) zippable[k] = [v, { level: k === 'backup.json' ? 6 : 0 }]
  const zipped = zipSync(zippable)
  if (opts.passphrase) {
    opts.onProgress?.({ phase: 'encrypt', done: 0, total: 1 })
    return encryptBytes(zipped, opts.passphrase)
  }
  return zipped
}

/** Convenience: collect + zip. */
export async function createBackupZip(opts: { passphrase?: string; onProgress?: ProgressFn } = {}): Promise<Uint8Array> {
  const bundle = await collectBackup(opts.onProgress)
  return bundleToZip(bundle, opts)
}

export function backupFileName(encrypted = false, d = new Date()): string {
  const stamp = d.toISOString().slice(0, 10)
  return `myquizz-backup-${stamp}.${encrypted ? 'mqz' : 'zip'}`
}

/** Parse ZIP (or encrypted ZIP, or plain backup.json) bytes into a bundle. Throws 'needPassphrase' / 'wrongPassphrase'. */
export async function readBackup(bytes: Uint8Array, opts: { passphrase?: string; onProgress?: ProgressFn } = {}): Promise<BackupBundle> {
  let data = bytes
  if (isEncrypted(data)) {
    if (!opts.passphrase) throw new Error('needPassphrase')
    opts.onProgress?.({ phase: 'decrypt', done: 0, total: 1 })
    data = await decryptBytes(data, opts.passphrase)
  }
  opts.onProgress?.({ phase: 'read', done: 0, total: 1 })
  const media = new Map<string, Blob>()
  let backup: unknown
  if (data[0] === 0x50 && data[1] === 0x4b) {
    const files = unzipSync(data)
    const json = files['backup.json']
    if (!json) throw new Error('noBackupJson')
    backup = JSON.parse(strFromU8(json))
    if (!isBackup(backup)) throw new Error('notBackup')
    for (const ref of backup.media ?? []) {
      if (ref.file && files[ref.file]) media.set(ref.id, new Blob([files[ref.file] as BlobPart], { type: ref.mime }))
      else if (ref.dataUrl) media.set(ref.id, await dataUrlToBlob(ref.dataUrl))
    }
    // media files without a manifest entry
    for (const [name, content] of Object.entries(files)) {
      const m = /^media\/([^/.]+)\.([a-z0-9]+)$/i.exec(name)
      if (m && !media.has(m[1])) media.set(m[1], new Blob([content as BlobPart], { type: mimeForExt(m[2]) }))
    }
  } else {
    backup = JSON.parse(strFromU8(data))
    if (!isBackup(backup)) throw new Error('notBackup')
    for (const ref of backup.media ?? []) if (ref.dataUrl) media.set(ref.id, await dataUrlToBlob(ref.dataUrl))
  }
  return { backup, media }
}

export type RestoreMode = 'merge' | 'replace'

export interface RestoreSummary {
  sets: number
  cards: number
  media: number
  progress: number
  revlog: number
  sessions: number
  folders: number
}

/**
 * Restore a bundle. `merge` upserts by id (sets also by externalId) and never deletes;
 * `replace` wipes every table first.
 */
export async function restoreBackup(bundle: BackupBundle, mode: RestoreMode, onProgress?: ProgressFn): Promise<RestoreSummary> {
  const { backup, media } = bundle
  const steps = 8
  let step = 0
  const tick = () => onProgress?.({ phase: 'write', done: ++step, total: steps })

  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') for (const t of db.tables) await t.clear()

    // Folders
    const folders: Folder[] = backup.folders ?? []
    await db.folders.bulkPut(folders)
    tick()

    // Sets: in merge mode, a set with the same externalId as an existing one updates that set (and remaps ids).
    const setIdMap = new Map<string, string>()
    const sets: StudySet[] = []
    for (const s of backup.sets) {
      let target = s
      if (mode === 'merge') {
        const byId = await db.sets.get(s.id)
        if (!byId && s.externalId) {
          const byExt = await db.sets.where('externalId').equals(s.externalId).first()
          if (byExt) {
            setIdMap.set(s.id, byExt.id)
            target = { ...s, id: byExt.id }
          }
        }
      }
      sets.push(target)
    }
    await db.sets.bulkPut(sets)
    tick()

    const remapSet = (id: string) => setIdMap.get(id) ?? id
    const cards: Card[] = backup.cards.map((c) => ({ ...c, setId: remapSet(c.setId) }))
    await db.cards.bulkPut(cards)
    tick()

    const mediaItems: MediaItem[] = []
    for (const ref of backup.media ?? []) {
      const blob = media.get(ref.id)
      if (blob) mediaItems.push({ id: ref.id, mime: ref.mime || blob.type, blob, createdAt: Date.now() })
    }
    await db.media.bulkPut(mediaItems)
    tick()

    const progress: Progress[] = (backup.progress ?? []).map((p) => ({ ...p, setId: remapSet(p.setId) }))
    await db.progress.bulkPut(progress)
    tick()

    // Revlog has auto-increment ids: in merge mode drop entries that already exist for (cardId, ts).
    let revlog: RevlogEntry[] = (backup.revlog ?? []).map((r) => ({ ...r, setId: remapSet(r.setId) }))
    if (mode === 'merge' && revlog.length) {
      const existing = new Set((await db.revlog.toArray()).map((r) => `${r.cardId}:${r.ts}`))
      revlog = revlog.filter((r) => !existing.has(`${r.cardId}:${r.ts}`))
    }
    await db.revlog.bulkAdd(revlog.map(({ id: _id, ...rest }) => rest as RevlogEntry))
    tick()

    const sessions: Session[] = (backup.sessions ?? []).map((s) => ({ ...s, setId: remapSet(s.setId) }))
    await db.sessions.bulkPut(sessions)
    await db.achievements.bulkPut(backup.achievements ?? [])
    tick()

    if (backup.streak) {
      const cur = mode === 'merge' ? await db.streak.get('streak') : undefined
      const merged: Streak = cur
        ? {
            id: 'streak',
            current: Math.max(cur.current, backup.streak.current),
            longest: Math.max(cur.longest, backup.streak.longest),
            lastDay: cur.lastDay > backup.streak.lastDay ? cur.lastDay : backup.streak.lastDay,
            days: [...new Set([...cur.days, ...backup.streak.days])].sort().slice(-400),
          }
        : backup.streak
      await db.streak.put(merged)
    }
    tick()
  })

  if (mode === 'replace' && backup.settings) await saveSettings(backup.settings)

  return {
    sets: backup.sets.length,
    cards: backup.cards.length,
    media: media.size,
    progress: backup.progress?.length ?? 0,
    revlog: backup.revlog?.length ?? 0,
    sessions: backup.sessions?.length ?? 0,
    folders: backup.folders?.length ?? 0,
  }
}
