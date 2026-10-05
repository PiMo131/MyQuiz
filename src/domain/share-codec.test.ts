import { describe, expect, it } from 'vitest'
import { decodeSet, encodeSet, isShareCode } from './share-codec'
import type { Card, StudySet } from './types'

describe('share-codec', () => {
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
