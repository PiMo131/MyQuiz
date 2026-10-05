import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/domain/text'
import { buildSpeedQuestions, speedPoints, SR_BASE_POINTS, SR_MIN_POINTS, SR_TIME_MS } from './speedreview'

const cards = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, term: `term ${i}`, definition: `def ${i}` }))

describe('speed review engine', () => {
  it('builds unique questions with 4 options including the answer', () => {
    const qs = buildSpeedQuestions(cards, mulberry32(1), 'term', 20)
    expect(qs).toHaveLength(8)
    expect(new Set(qs.map((q) => q.card.id)).size).toBe(8)
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
      expect(q.options).toContain(q.correct)
      expect(q.correct).toBe(q.card.definition)
      expect(q.prompt).toBe(q.card.term)
      expect(new Set(q.options).size).toBe(4)
    }
  })
  it('flips sides', () => {
    const [q] = buildSpeedQuestions(cards, mulberry32(1), 'definition', 1)
    expect(q.prompt).toBe(q.card.definition)
    expect(q.correct).toBe(q.card.term)
  })
  it('uses card distractors when answering with definitions', () => {
    const withD = [{ ...cards[0], distractors: ['x1', 'x2', 'x3'] }, ...cards.slice(1)]
    const qs = buildSpeedQuestions(withD, mulberry32(4), 'term', 20)
    const q = qs.find((x) => x.card.id === 'c0')!
    expect(q.options.sort()).toEqual(['def 0', 'x1', 'x2', 'x3'])
  })
  it('scores faster answers higher and adds a capped streak bonus', () => {
    expect(speedPoints(0, 0)).toBe(SR_BASE_POINTS)
    expect(speedPoints(SR_TIME_MS, 0)).toBe(SR_MIN_POINTS)
    expect(speedPoints(SR_TIME_MS * 2, 0)).toBe(SR_MIN_POINTS)
    expect(speedPoints(2500, 0)).toBe(60)
    expect(speedPoints(0, 3)).toBe(SR_BASE_POINTS + 30)
    expect(speedPoints(0, 50)).toBe(SR_BASE_POINTS + 50)
  })
})
