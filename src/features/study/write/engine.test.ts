import { describe, expect, it } from 'vitest'
import type { Card } from '@/domain/types'
import { answerWrite, createWrite, nextWrite, overrideCorrect } from './engine'

const cards: Card[] = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, setId: 's', position: i, term: `t${i}`, definition: `d${i}`, starred: false, suspended: false, createdAt: 0, updatedAt: 0 }))

describe('write engine', () => {
  it('asks every card once and repeats wrong ones in a second round', () => {
    let s = createWrite(cards, { shuffle: false })
    expect(s.total).toBe(4)
    const results = [true, false, true, false]
    for (const r of results) {
      s = nextWrite(s, cards, 'definition')
      expect(s.current).not.toBeNull()
      s = answerWrite(s, r)
    }
    expect(s.correct).toBe(2)
    expect(s.incorrect).toBe(2)
    expect(s.done).toBe(false)
    s = nextWrite(s, cards, 'definition')
    expect(s.round).toBe(2)
    expect(s.queue).toEqual(['c1', 'c3'])
    s = answerWrite(s, true)
    s = nextWrite(s, cards, 'definition')
    s = answerWrite(s, true)
    expect(s.done).toBe(true)
  })

  it('override marks a wrong answer as correct', () => {
    let s = createWrite(cards, { shuffle: false })
    s = nextWrite(s, cards, 'term')
    expect(s.current?.prompt).toBe('d0')
    s = answerWrite(s, false)
    s = overrideCorrect(s, 'c0')
    expect(s.wrong).toEqual([])
    expect(s.correct).toBe(1)
    expect(s.incorrect).toBe(0)
  })
})
