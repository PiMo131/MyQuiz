import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/domain/text'
import { acceptedAnswers, buildChoices, cardCycler, playableCards, promptOf } from './questions'

const cards = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, term: `term ${i}`, definition: `def ${i}`, starred: i < 2, suspended: i === 5 }))

describe('questions helpers', () => {
  it('filters suspended/empty cards and honours starred-only with fallback', () => {
    expect(playableCards(cards)).toHaveLength(5)
    expect(playableCards(cards, true)).toHaveLength(2)
    expect(playableCards([{ id: 'x', term: 'a', definition: '' }, cards[0]])).toHaveLength(1)
    expect(playableCards([cards[0], cards[2]], true)).toHaveLength(2) // only one starred -> fallback to all
  })
  it('builds choices with the correct answer, deduped', () => {
    const dup = [{ id: 'a', term: 'A', definition: 'same' }, { id: 'b', term: 'B', definition: 'Same' }, { id: 'c', term: 'C', definition: 'other' }]
    const ch = buildChoices(dup, dup[0], 'term', mulberry32(1), 4)
    expect(ch).toContain('same')
    expect(ch).toContain('other')
    expect(ch).toHaveLength(2)
  })
  it('strips markdown from prompts and keeps alternatives', () => {
    expect(promptOf({ id: 'x', term: '**bold**', definition: 'd' }, 'term')).toBe('bold')
    expect(acceptedAnswers({ id: 'x', term: 't', definition: 'd', altAnswers: ['e'] }, 'term')).toEqual(['d', 'e'])
    expect(acceptedAnswers({ id: 'x', term: 't', definition: 'd', altAnswers: ['e'] }, 'definition')).toEqual(['t'])
  })
  it('cycles through all cards before repeating', () => {
    const next = cardCycler(cards, mulberry32(1))
    const seen = new Set(Array.from({ length: 6 }, () => next().id))
    expect(seen.size).toBe(6)
  })
})
