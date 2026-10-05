import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import type { Card, SharedSet, StudySet } from './types'
import { newId } from './id'

function toB64Url(u8: Uint8Array): string {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64Url(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b.length % 4 ? '='.repeat(4 - (b.length % 4)) : ''
  const bin = atob(b + pad)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8
}

/** Compact wire format to keep URLs short: [title, description, lang, [[term, def, hint?], ...]] */
type Wire = [string, string, string, string, Array<[string, string, string?]>, string?]

export function encodeSet(set: StudySet, cards: Card[]): string {
  const wire: Wire = [
    set.title,
    set.description ?? '',
    set.lang.term ?? '',
    set.lang.definition ?? '',
    cards.map((c) => (c.hint ? [c.term, c.definition, c.hint] : [c.term, c.definition])),
    set.id,
  ]
  const json = JSON.stringify(wire)
  const packed = deflateSync(strToU8(json), { level: 9 })
  return '1.' + toB64Url(packed)
}

export interface DecodedSet {
  title: string
  description: string
  lang: { term: string; definition: string }
  cards: Array<{ term: string; definition: string; hint?: string }>
  externalId?: string
}

/** Hard cap on decompressed share payloads (zip-bomb / memory protection). */
export const MAX_DECODED_BYTES = 5 * 1024 * 1024
const MAX_CARDS = 5000
const MAX_TEXT = 20_000

/** Inflate into a bounded buffer; fflate truncates to the buffer, so an overflow is detected by size. */
function inflateBounded(payload: string): string {
  const out = inflateSync(fromB64Url(payload), { out: new Uint8Array(MAX_DECODED_BYTES + 1) })
  if (out.length > MAX_DECODED_BYTES) throw new Error('Share code too large')
  return strFromU8(out)
}

const str = (x: unknown, max = MAX_TEXT): string => (typeof x === 'string' ? x.slice(0, max) : '')
const optStr = (x: unknown, max = MAX_TEXT): string | undefined => (typeof x === 'string' && x ? x.slice(0, max) : undefined)
const strList = (x: unknown, max = 50): string[] | undefined => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(0, max) : undefined)
const idPair = (x: unknown): { term?: string; definition?: string } | undefined => {
  if (!x || typeof x !== 'object') return undefined
  const o = x as Record<string, unknown>
  const out = { term: optStr(o.term, 200), definition: optStr(o.definition, 200) }
  return out.term || out.definition ? out : undefined
}
const MEDIA_MIME = /^(image|audio)\/[a-z0-9.+-]+$/i

/** True when the raw payload carries its own non-empty `set.id` (so it can be used to recognise re-imports). */
export function hasExplicitSetId(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const s = (x as Record<string, unknown>).set
  if (!s || typeof s !== 'object') return false
  const id = (s as Record<string, unknown>).id
  return typeof id === 'string' && id.trim().length > 0
}

/**
 * Validate and coerce an untrusted SharedSet (from a link, file or peer) into a well-typed one.
 * Unknown fields are dropped, strings are capped, media is limited to image/audio data URLs.
 * A missing set or card id gets a fresh unique id, so two id-less payloads never collide in the DB.
 */
export function sanitizeSharedSet(x: unknown): SharedSet {
  if (!x || typeof x !== 'object') throw new Error('Invalid shared set')
  const o = x as Record<string, unknown>
  if (o.format !== 'myquizz-set' || !Array.isArray(o.cards) || !o.set || typeof o.set !== 'object') throw new Error('Invalid shared set')
  const s = o.set as Record<string, unknown>
  const lang = (s.lang && typeof s.lang === 'object' ? s.lang : {}) as Record<string, unknown>
  const now = Date.now()
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const set: SharedSet['set'] = {
    id: str(s.id, 64).trim() || newId(),
    title: str(s.title, 500),
    description: str(s.description, 5000),
    tags: strList(s.tags) ?? [],
    lang: { term: str(lang.term, 16), definition: str(lang.definition, 16) },
    cardTypes: (strList(s.cardTypes) ?? ['basic']).filter((t): t is StudySet['cardTypes'][number] => ['basic', 'reverse', 'cloze', 'occlusion', 'typeIn'].includes(t)),
    visibility: 'private',
    author: optStr(s.author, 100),
    externalId: optStr(s.externalId, 64),
    createdAt: num(s.createdAt, now),
    updatedAt: num(s.updatedAt, now),
  }
  const cards: Card[] = (o.cards as unknown[])
    .slice(0, MAX_CARDS)
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c, i) => {
      const flag = c.flag
      return {
        id: str(c.id, 64).trim() || newId(),
        setId: set.id,
        position: i,
        term: str(c.term),
        definition: str(c.definition),
        hint: optStr(c.hint),
        mnemonic: optStr(c.mnemonic),
        example: optStr(c.example),
        altAnswers: strList(c.altAnswers),
        distractors: strList(c.distractors, 3),
        image: idPair(c.image),
        audio: idPair(c.audio),
        cloze: optStr(c.cloze) ?? null,
        occlusion: null,
        starred: c.starred === true,
        suspended: c.suspended === true,
        flag: flag === 'red' || flag === 'orange' || flag === 'green' || flag === 'blue' ? flag : null,
        createdAt: num(c.createdAt, now),
        updatedAt: num(c.updatedAt, now),
      }
    })
  const media: NonNullable<SharedSet['media']> = []
  if (Array.isArray(o.media)) {
    for (const m of o.media as unknown[]) {
      if (!m || typeof m !== 'object') continue
      const r = m as Record<string, unknown>
      const id = optStr(r.id, 200)
      const mime = optStr(r.mime, 100)
      const dataUrl = typeof r.dataUrl === 'string' ? r.dataUrl : ''
      if (!id || !mime || !MEDIA_MIME.test(mime)) continue
      if (!new RegExp(`^data:${mime.replace(/[.+]/g, '\\$&')}[;,]`, 'i').test(dataUrl)) continue
      media.push({ id, mime, dataUrl })
    }
  }
  return { format: 'myquizz-set', version: 1, set, cards, ...(media.length ? { media } : {}) }
}

export function decodeSet(code: string): DecodedSet {
  const [v, payload] = code.split('.', 2)
  if (v !== '1' || !payload) throw new Error('Unsupported share code')
  const w = JSON.parse(inflateBounded(payload)) as unknown
  if (!Array.isArray(w) || !Array.isArray(w[4])) throw new Error('Invalid share code')
  const cards = (w[4] as unknown[])
    .slice(0, MAX_CARDS)
    .filter((c): c is unknown[] => Array.isArray(c))
    .map((c) => {
      const term = str(c[0])
      const definition = str(c[1])
      const hint = optStr(c[2])
      return hint ? { term, definition, hint } : { term, definition }
    })
  return {
    title: str(w[0], 500),
    description: str(w[1], 5000),
    lang: { term: str(w[2], 16), definition: str(w[3], 16) },
    cards,
    externalId: optStr(w[5], 64),
  }
}

/** JSON (SharedSet) → compressed base64url, used for larger payloads with media. */
export function encodeShared(shared: SharedSet): string {
  return '2.' + toB64Url(deflateSync(strToU8(JSON.stringify(shared)), { level: 9 }))
}
export function decodeShared(code: string): SharedSet {
  const [v, payload] = code.split('.', 2)
  if (v !== '2' || !payload) throw new Error('Unsupported share code')
  return sanitizeSharedSet(JSON.parse(inflateBounded(payload)))
}

export function isShareCode(s: string): boolean {
  return /^[12]\.[A-Za-z0-9_-]+$/.test(s.trim())
}

/** Find a share code in free text: a bare code, an `#/import?d=` link or an `#/embed/` link. */
export function extractShareCode(input: string): string | undefined {
  const s = input.trim()
  if (!s) return undefined
  if (isShareCode(s)) return s
  const m = /[?&]d=([12]\.[A-Za-z0-9_-]+)/.exec(s) || /#\/embed\/([12]\.[A-Za-z0-9_-]+)/.exec(s)
  if (m) return decodeURIComponent(m[1])
  return undefined
}

/** Build a full share URL for the current deployment. */
export function shareUrl(code: string, base = `${location.origin}${location.pathname}`): string {
  return `${base}#/import?d=${code}`
}

export const URL_WARN_BYTES = 8 * 1024
