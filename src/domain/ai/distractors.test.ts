import { describe, expect, it } from 'vitest'
import type { Card } from '@/domain/types'
import { mulberry32 } from '@/domain/text'
import { perturbNumber, pickDistractors, pickDistractorsFor } from './distractors'

const mk = (id: string, term: string, definition: string, extra: Partial<Card> = {}): Card => ({
  id,
  setId: 's',
  position: 0,
  term,
  definition,
  starred: false,
  suspended: false,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
})

describe('pickDistractors', () => {
  const pool = [
    mk('1', 'hond', 'dog'),
    mk('2', 'kat', 'cat'),
    mk('3', 'vogel', 'bird'),
    mk('4', 'paard', 'horse'),
    mk('5', 'definitie', 'A long sentence describing a concept in detail for the quiz'),
  ]
  it('never returns the correct answer and prefers similar-shaped answers', () => {
    const d = pickDistractors(pool[0], pool, 3, { rng: mulberry32(1) })
    expect(d).toHaveLength(3)
    expect(d).not.toContain('dog')
    expect(d).not.toContain(pool[4].definition)
  })
  it('uses user-supplied distractors first', () => {
    const c = mk('9', 'x', 'y', { distractors: ['a', 'b', 'c'] })
    expect(pickDistractors(c, pool, 3)).toEqual(['a', 'b', 'c'])
  })
  it('perturbs numbers when the pool is small', () => {
    const d = pickDistractorsFor('1945', ['1945'], 3, mulberry32(2))
    expect(d).toHaveLength(3)
    expect(d).not.toContain('1945')
    expect(d.every((x) => /^\d+$/.test(x))).toBe(true)
  })
  it('dedupes case/markup variants of the answer', () => {
    const d = pickDistractorsFor('Dog', ['**dog**', 'DOG', 'cat', 'bird'], 3)
    expect(d.sort()).toEqual(['bird', 'cat'])
  })
})

describe('perturbNumber', () => {
  it('keeps decimals and suffix', () => {
    const out = perturbNumber('3,5 km', 2, mulberry32(3))
    expect(out).toHaveLength(2)
    for (const o of out) expect(o).toMatch(/^\d+,\d km$/)
  })
  it('returns nothing for non-numbers', () => {
    expect(perturbNumber('abc', 2)).toEqual([])
  })
})
