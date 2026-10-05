import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { addCards, createFolder, createSet, getCards, putMedia, recordOutcome, saveSettings, wipeAll } from '@/db/repo'
import { backupFileName, collectBackup, bundleToZip, createBackupZip, readBackup, restoreBackup } from './backup'
import { decryptBytes, decryptText, encryptBytes, encryptText, isEncrypted } from './crypto'
import { blobToBytes } from './files'

async function seed() {
  const folder = await createFolder('Talen')
  const set = await createSet({ title: 'Dieren', folderId: folder.id, externalId: 'ext-1', tags: ['nl'] })
  const media = await putMedia(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' }))
  const cards = await addCards(set.id, [
    { setId: set.id, term: 'hond', definition: 'dog', image: { term: media.id } },
    { setId: set.id, term: 'kat', definition: 'cat' },
  ])
  await recordOutcome(cards[0], true, 'learn')
  await db.streak.put({ id: 'streak', current: 2, longest: 5, lastDay: '2026-10-05', days: ['2026-10-04', '2026-10-05'] })
  return { folder, set, cards, media }
}

describe('backup', () => {
  beforeEach(async () => {
    await wipeAll()
  })

  it('zip round-trip with replace', async () => {
    const { set, media } = await seed()
    const bundle = await collectBackup()
    // fake-indexeddb (jsdom) cannot round-trip Blobs, so inject the media blob into the bundle explicitly.
    bundle.backup.media = [{ id: media.id, mime: 'image/webp', file: `media/${media.id}.webp` }]
    bundle.media.set(media.id, new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' }))
    const zip = await bundleToZip(bundle)
    expect(zip[0]).toBe(0x50) // 'P' of PK
    await wipeAll()
    expect(await db.sets.count()).toBe(0)
    const read = await readBackup(zip)
    expect(read.backup.format).toBe('myquizz-backup')
    expect(read.backup.sets).toHaveLength(1)
    expect(await blobToBytes(read.media.get(media.id)!)).toEqual(new Uint8Array([1, 2, 3, 4]))
    const summary = await restoreBackup(read, 'replace')
    expect(summary).toMatchObject({ sets: 1, cards: 2, media: 1, progress: 1, revlog: 1, folders: 1 })
    expect(await db.sets.get(set.id)).toMatchObject({ title: 'Dieren' })
    expect(await getCards(set.id)).toHaveLength(2)
    expect(await db.media.count()).toBe(1)
    expect(await db.revlog.count()).toBe(1)
    expect((await db.streak.get('streak'))?.longest).toBe(5)
  })

  it('createBackupZip produces a zip', async () => {
    await seed()
    const zip = await createBackupZip()
    const read = await readBackup(zip)
    expect(read.backup.cards).toHaveLength(2)
  })

  it('merge does not duplicate revlog and updates by externalId', async () => {
    const { set } = await seed()
    const bundle = await collectBackup()
    // Simulate the same set imported elsewhere under a new id but same externalId.
    await wipeAll()
    const other = await createSet({ title: 'Oud', externalId: 'ext-1' })
    bundle.backup.sets[0] = { ...bundle.backup.sets[0], title: 'Nieuw' }
    const summary = await restoreBackup(bundle, 'merge')
    expect(summary.sets).toBe(1)
    expect(await db.sets.count()).toBe(1)
    expect((await db.sets.get(other.id))?.title).toBe('Nieuw')
    expect(await db.sets.get(set.id)).toBeUndefined()
    const cards = await getCards(other.id)
    expect(cards).toHaveLength(2)
    // merge again → revlog stays at 1
    await restoreBackup(bundle, 'merge')
    expect(await db.revlog.count()).toBe(1)
    expect(await db.cards.count()).toBe(2)
  })

  it('encrypted backup needs the passphrase', async () => {
    await seed()
    const bundle = await collectBackup()
    const enc = await bundleToZip(bundle, { passphrase: 'geheim' })
    expect(isEncrypted(enc)).toBe(true)
    await expect(readBackup(enc)).rejects.toThrow('needPassphrase')
    await expect(readBackup(enc, { passphrase: 'fout' })).rejects.toThrow('wrongPassphrase')
    const ok = await readBackup(enc, { passphrase: 'geheim' })
    expect(ok.backup.cards).toHaveLength(2)
    expect(backupFileName(true, new Date('2026-10-05T10:00:00Z'))).toBe('myquizz-backup-2026-10-05.mqz')
  })

  it('reads plain backup.json', async () => {
    await seed()
    const { backup } = await collectBackup()
    const json = new TextEncoder().encode(JSON.stringify({ ...backup, media: [] }))
    const bundle = await readBackup(json)
    expect(bundle.backup.sets).toHaveLength(1)
  })
})

describe('crypto', () => {
  it('round-trips bytes and text', async () => {
    const data = new Uint8Array([0, 1, 2, 250, 255])
    const enc = await encryptBytes(data, 'pw', 1000)
    expect(isEncrypted(enc)).toBe(true)
    expect(isEncrypted(data)).toBe(false)
    expect(await decryptBytes(enc, 'pw')).toEqual(data)
    await expect(decryptBytes(enc, 'other')).rejects.toThrow('wrongPassphrase')
    const t = await encryptText('héllo ☕', 'pw')
    expect(await decryptText(t, 'pw')).toBe('héllo ☕')
  })
})

describe('backup secrets', () => {
  beforeEach(async () => {
    await wipeAll()
  })
  it('strips the BYOK key and proxy URL unless explicitly included', async () => {
    await saveSettings({ ai: { provider: 'byok', byok: { vendor: 'openai', apiKey: 'sk-secret' }, proxyUrl: 'https://proxy.example' } })
    const { backup } = await collectBackup()
    expect(backup.settings?.ai?.byok).toBeUndefined()
    expect(backup.settings?.ai?.proxyUrl).toBeUndefined()
    expect(backup.settings?.ai?.provider).toBe('byok')
    expect(JSON.stringify(backup)).not.toContain('sk-secret')
    const withSecrets = await collectBackup(undefined, { includeSecrets: true })
    expect(withSecrets.backup.settings?.ai?.byok?.apiKey).toBe('sk-secret')
  })
})
