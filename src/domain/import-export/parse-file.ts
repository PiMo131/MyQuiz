/**
 * Parse an uploaded file of any supported kind (text formats, MyQuizz JSON, encrypted .mqz, Anki .apkg).
 * sql.js is loaded lazily only for .apkg. Media referenced by .apkg notes is stored via putMedia.
 */
import { unzipSync } from 'fflate'
import { putMedia } from '@/db/repo'
import { decryptText, isEncrypted } from './crypto'
import { mimeForExt, readFileBytes } from './files'
import { isBackup } from './backup'
import { parseAny, parseApkg, type ParseResult, type SqlLike } from './parsers'

export type ParseFileOutcome = { kind: 'result'; result: ParseResult } | { kind: 'needPassphrase' } | { kind: 'backup' }

let sqlPromise: Promise<SqlLike> | undefined
async function loadSql(): Promise<SqlLike> {
  sqlPromise ??= Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]).then(([{ default: initSqlJs }, { default: wasmUrl }]) =>
    initSqlJs({ locateFile: () => wasmUrl }),
  ) as Promise<SqlLike>
  return sqlPromise
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

function looksLikeBackupJson(text: string): boolean {
  try {
    return isBackup(JSON.parse(text))
  } catch {
    return false
  }
}

/** Store .apkg media blobs and rewrite `images` file names to media ids. */
async function attachApkgMedia(res: ParseResult): Promise<void> {
  if (!res.media?.size) return
  const idByName = new Map<string, string>()
  for (const c of res.cards) {
    for (const side of ['term', 'definition'] as const) {
      const name = c.images?.[side]
      if (!name) continue
      let id = idByName.get(name)
      const data = res.media.get(name)
      if (!id && data) {
        const mime = mimeForExt(name.split('.').pop() ?? '')
        if (mime.startsWith('image/')) {
          const m = await putMedia(new Blob([data as BlobPart], { type: mime }))
          id = m.id
          idByName.set(name, id)
        }
      }
      if (id) c.images = { ...c.images, [side]: id }
      else if (c.images) delete c.images[side]
    }
  }
}

export async function parseImportFile(file: File, passphrase?: string): Promise<ParseFileOutcome> {
  const bytes = await readFileBytes(file)
  if (isEncrypted(bytes)) {
    if (!passphrase) return { kind: 'needPassphrase' }
    const text = await decryptText(bytes, passphrase)
    if (looksLikeBackupJson(text)) return { kind: 'backup' }
    return { kind: 'result', result: parseAny(text, 'decrypted.json') }
  }
  if (isZip(bytes)) {
    const entries = unzipSync(bytes)
    if ('backup.json' in entries) return { kind: 'backup' }
    const sql = await loadSql()
    const result = parseApkg(bytes, sql)
    await attachApkgMedia(result)
    return { kind: 'result', result }
  }
  const text = new TextDecoder().decode(bytes)
  if (looksLikeBackupJson(text)) return { kind: 'backup' }
  return { kind: 'result', result: parseAny(text, file.name) }
}
