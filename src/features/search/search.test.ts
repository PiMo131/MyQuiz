import { describe, expect, it } from 'vitest'
import { highlightSegments, scoreText, searchSets, tokens } from './search'
import type { StudySet } from '@/domain/types'

const set = (id: string, title: string, tags: string[] = [], description = ''): StudySet => ({ id, title, description, tags, lang: { term: '', definition: '' }, cardTypes: ['basic'], visibility: 'private', createdAt: 0, updatedAt: 0 })

describe('search', () => {
  it('tokenizes and normalizes accents', () => {
    expect(tokens('  Café  Latté ')).toEqual(['cafe', 'latte'])
  })
  it('requires all tokens and ranks prefixes higher', () => {
    expect(scoreText('Photosynthesis basics', ['photo', 'basics'])).toBeGreaterThan(0)
    expect(scoreText('Photosynthesis basics', ['photo', 'xyz'])).toBe(0)
    expect(scoreText('Biology', ['bio'])).toBeGreaterThan(scoreText('Marine biology', ['bio']))
  })
  it('searches sets by title, tags and description', () => {
    const hits = searchSets([set('a', 'Frans hoofdstuk 2', ['frans']), set('b', 'Wiskunde', [], 'over Franse getallen'), set('c', 'Duits')], 'frans')
    expect(hits.map((h) => h.set.id)).toEqual(['a', 'b'])
    expect(hits[0].field).toBe('title')
  })
  it('highlights matches case- and accent-insensitively', () => {
    const segs = highlightSegments('Café au lait', 'cafe')
    expect(segs).toEqual([{ text: 'Café', hit: true }, { text: ' au lait', hit: false }])
    expect(highlightSegments('abc', '')).toEqual([{ text: 'abc', hit: false }])
  })
})
