import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/domain/text'
import { buildPracticeTest, gradePracticeAnswer, scoreTest } from './practiceTest'

const src = [
  { id: 'a', term: 'hond', definition: 'dog' },
  { id: 'b', term: 'kat', definition: 'cat' },
  { id: 'c', term: 'vogel', definition: 'bird' },
  { id: 'd', term: 'paard', definition: 'horse' },
  { id: 'e', term: 'vis', definition: 'fish' },
]

describe('buildPracticeTest', () => {
  it('mixes types and builds valid MC options', () => {
    const qs = buildPracticeTest(src, { count: 5, rng: mulberry32(7) })
    expect(qs).toHaveLength(5)
    const mc = qs.filter((q) => q.type === 'multipleChoice')
    expect(mc.length).toBeGreaterThan(0)
    for (const q of mc) {
      expect(q.options).toHaveLength(4)
      expect(q.options).toContain(q.answer)
      expect(new Set(q.options).size).toBe(4)
    }
    const tf = qs.filter((q) => q.type === 'trueFalse')
    for (const q of tf) expect(['true', 'false']).toContain(q.answer)
  })
  it('restricts to requested types', () => {
    const qs = buildPracticeTest(src, { count: 4, types: ['written'], rng: mulberry32(1) })
    expect(qs.every((q) => q.type === 'written')).toBe(true)
  })
})

describe('grading', () => {
  it('grades written answers with the shared grading rules', () => {
    const q = { id: 'q1', type: 'written' as const, prompt: 'hond', answer: 'dog' }
    expect(gradePracticeAnswer(q, 'Dog').correct).toBe(true)
    expect(gradePracticeAnswer(q, 'cat').correct).toBe(false)
  })
  it('scores a whole test', () => {
    const qs = buildPracticeTest(src, { count: 3, types: ['written'], rng: mulberry32(3) })
    const answers = Object.fromEntries(qs.map((q) => [q.id, q.answer]))
    expect(scoreTest(qs, answers).correct).toBe(3)
  })
})
