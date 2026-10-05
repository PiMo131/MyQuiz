import { describe, expect, it } from 'vitest'
import type { Card } from '@/domain/types'
import { continueLearning, createSort, finished, mark, undo } from './engine'

const cards: Card[] = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, setId: 's', position: i, term: `t${i}`, definition: `d${i}`, starred: i === 0, suspended: false, createdAt: 0, updatedAt: 0 }))

describe('flashcard sorting', () => {
  it('marks, undoes and continues with still-learning cards', () => {
    let s = createSort(cards)
    s = mark(s, true)
    s = mark(s, false)
    expect(s.known).toEqual(['c0'])
    expect(s.learning).toEqual(['c1'])
    s = undo(s)
    expect(s.learning).toEqual([])
    expect(s.index).toBe(1)
    s = mark(s, false)
    s = mark(s, false)
    expect(finished(s)).toBe(true)
    const next = continueLearning(s)
    expect(next.order).toEqual(['c1', 'c2'])
    expect(next.round).toBe(2)
  })

  it('filters starred', () => {
    expect(createSort(cards, { starredOnly: true }).order).toEqual(['c0'])
  })
})
