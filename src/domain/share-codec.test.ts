import { describe, expect, it } from 'vitest'
import { deflateSync, strToU8 } from 'fflate'
import { MAX_DECODED_BYTES, decodeSet, decodeShared, encodeSet, encodeShared, isShareCode, sanitizeSharedSet } from './share-codec'
import type { Card, SharedSet, StudySet } from './types'

const set: StudySet = {
  id: 'abc',
  title: 'Dieren',
  description: 'NL → EN',
  tags: [],
  lang: { term: 'nl', definition: 'en' },
  cardTypes: ['basic'],
  visibility: 'private',
  createdAt: 1,
  updatedAt: 1,
}
const cards: Card[] = [
  { id: '1', setId: 'abc', position: 0, term: 'hond', definition: 'dog', starred: false, suspended: false, createdAt: 1, updatedAt: 1 },
  { id: '2', setId: 'abc', position: 1, term: 'kat', definition: 'cat', hint: 'miauw', starred: false, suspended: false, createdAt: 1, updatedAt: 1 },
]

describe('share-codec', () => {
  it('round-trips', () => {
    const code = encodeSet(set, cards)
    expect(isShareCode(code)).toBe(true)
    const d = decodeSet(code)
    expect(d.title).toBe('Dieren')
    expect(d.cards).toEqual([
      { term: 'hond', definition: 'dog' },
      { term: 'kat', definition: 'cat', hint: 'miauw' },
    ])
    expect(d.externalId).toBe('abc')
  })
  it('handles unicode', () => {
    const d = decodeSet(encodeSet(set, [{ ...cards[0], term: 'café ☕ 日本' }]))
    expect(d.cards[0].term).toBe('café ☕ 日本')
  })
})

describe('share-codec hardening', () => {
  const pack = (v: '1' | '2', value: unknown) => `${v}.` + Buffer.from(deflateSync(strToU8(JSON.stringify(value)))).toString('base64url')

  it('rejects garbage and non-array wire payloads without crashing the caller in odd ways', () => {
    expect(() => decodeSet('1.!!!')).toThrow()
    expect(() => decodeSet('3.abc')).toThrow()
    expect(() => decodeSet(pack('1', { not: 'an array' }))).toThrow()
    expect(() => decodeSet(pack('1', ['t', 'd', '', '', 'cards?']))).toThrow()
  })

  it('coerces non-string card fields to strings and drops malformed cards', () => {
    const d = decodeSet(pack('1', [42, null, 'nl', 'en', [[1, { x: 1 }], 'junk', ['a', 'b', 7]], 123]))
    expect(d.title).toBe('')
    expect(d.cards).toEqual([
      { term: '', definition: '' },
      { term: 'a', definition: 'b' },
    ])
    expect(d.externalId).toBeUndefined()
  })

  it('rejects payloads above the decompressed size cap', () => {
    const huge = 'x'.repeat(MAX_DECODED_BYTES + 1024)
    expect(() => decodeSet(pack('1', ['t', huge, '', '', []]))).toThrow(/too large/)
  })

  it('sanitizes shared sets: unknown fields, bad media mime and wrong data url prefix are dropped', () => {
    const shared = sanitizeSharedSet({
      format: 'myquizz-set',
      version: 1,
      set: { id: 'ext', title: 'T', description: 1, tags: ['a', 2], lang: null, __proto__: { polluted: true }, evil: 'x' },
      cards: [
        { id: 'c1', term: 'a', definition: 'b', evil: 'x', starred: 'yes', flag: 'purple', image: { term: 'm1' } },
        null,
        'junk',
        { term: 1 },
      ],
      media: [
        { id: 'm1', mime: 'image/png', dataUrl: 'data:image/png;base64,AAAA' },
        { id: 'm2', mime: 'text/html', dataUrl: 'data:text/html,<script>' },
        { id: 'm3', mime: 'image/png', dataUrl: 'data:text/html;base64,AAAA' },
        { id: 'm4', mime: 'audio/mpeg', dataUrl: 'data:audio/mpeg;base64,AAAA' },
      ],
    })
    expect(shared.set.title).toBe('T')
    expect(shared.set.description).toBe('')
    expect(shared.set.tags).toEqual(['a'])
    expect('evil' in shared.set).toBe(false)
    expect(shared.cards).toHaveLength(2)
    expect(shared.cards[0]).toMatchObject({ id: 'c1', term: 'a', definition: 'b', starred: false, flag: null, image: { term: 'm1' } })
    expect('evil' in shared.cards[0]).toBe(false)
    expect(shared.cards[1].term).toBe('')
    expect(shared.media?.map((m) => m.id)).toEqual(['m1', 'm4'])
    expect(() => sanitizeSharedSet({ format: 'nope' })).toThrow()
  })

  it('decodeShared round-trips through the sanitizer', () => {
    const shared: SharedSet = { format: 'myquizz-set', version: 1, set: { ...set }, cards }
    const back = decodeShared(encodeShared(shared))
    expect(back.cards.map((c) => c.term)).toEqual(['hond', 'kat'])
    expect(back.set.id).toBe('abc')
  })
})
