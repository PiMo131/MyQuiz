import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import type { Card, SharedSet, StudySet } from './types'

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

export function decodeSet(code: string): DecodedSet {
  const [v, payload] = code.split('.', 2)
  if (v !== '1' || !payload) throw new Error('Unsupported share code')
  const json = strFromU8(inflateSync(fromB64Url(payload)))
  const w = JSON.parse(json) as Wire
  return {
    title: w[0],
    description: w[1],
    lang: { term: w[2], definition: w[3] },
    cards: w[4].map(([term, definition, hint]) => (hint ? { term, definition, hint } : { term, definition })),
    externalId: w[5],
  }
}

/** JSON (SharedSet) → compressed base64url, used for larger payloads with media. */
export function encodeShared(shared: SharedSet): string {
  return '2.' + toB64Url(deflateSync(strToU8(JSON.stringify(shared)), { level: 9 }))
}
export function decodeShared(code: string): SharedSet {
  const [v, payload] = code.split('.', 2)
  if (v !== '2' || !payload) throw new Error('Unsupported share code')
  return JSON.parse(strFromU8(inflateSync(fromB64Url(payload)))) as SharedSet
}

export function isShareCode(s: string): boolean {
  return /^[12]\.[A-Za-z0-9_-]+$/.test(s.trim())
}

/** Build a full share URL for the current deployment. */
export function shareUrl(code: string, base = `${location.origin}${location.pathname}`): string {
  return `${base}#/import?d=${code}`
}

export const URL_WARN_BYTES = 8 * 1024
