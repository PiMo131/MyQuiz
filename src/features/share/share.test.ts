import { describe, expect, it } from 'vitest'
import type { Card, SharedSet, StudySet } from '@/domain/types'
import { encodeSet, encodeShared } from '@/domain/share-codec'
import { decodeCode, extractCode } from './share-utils'

const set: StudySet = {
  id: 'set1',
  title: 'Dieren',
  description: 'NL → EN',
  tags: ['nl'],
  lang: { term: 'nl', definition: 'en' },
  cardTypes: ['basic'],
  visibility: 'private',
  createdAt: 1,
  updatedAt: 1,
}
const cards: Card[] = [
  { id: 'c1', setId: 'set1', position: 0, term: 'hond', definition: 'dog', starred: false, suspended: false, createdAt: 1, updatedAt: 1 },
  { id: 'c2', setId: 'set1', position: 1, term: 'kat', definition: 'cat', hint: 'miauw', starred: false, suspended: false, createdAt: 1, updatedAt: 1 },
]

describe('share-utils', () => {
  const code1 = encodeSet(set, cards)
  it('extracts codes from raw codes, import urls and embed urls', () => {
    expect(extractCode(code1)).toBe(code1)
    expect(extractCode(`https://example.org/MyQuiz/#/import?d=${code1}`)).toBe(code1)
    expect(extractCode(`https://example.org/MyQuiz/#/embed/${code1}`)).toBe(code1)
    expect(extractCode('hello world')).toBeUndefined()
    expect(extractCode('')).toBeUndefined()
  })
  it('decodes format 1', () => {
    const d = decodeCode(code1)
    expect(d.title).toBe('Dieren')
    expect(d.externalId).toBe('set1')
    expect(d.cards).toEqual([
      { term: 'hond', definition: 'dog' },
      { term: 'kat', definition: 'cat', hint: 'miauw' },
    ])
    expect(d.shared).toBeUndefined()
  })
  it('decodes format 2 (SharedSet with ids)', () => {
    const shared: SharedSet = { format: 'myquizz-set', version: 1, set, cards }
    const d = decodeCode(encodeShared(shared))
    expect(d.title).toBe('Dieren')
    expect(d.tags).toEqual(['nl'])
    expect(d.cards[0]).toMatchObject({ term: 'hond', externalId: 'c1' })
    expect(d.shared?.cards).toHaveLength(2)
  })
})
