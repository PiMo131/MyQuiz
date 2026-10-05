import { describe, expect, it } from 'vitest'
import type { Card } from '@/domain/types'
import { DEFAULT_TEST_SETUP, answeredCount, createTest, redemption, respond, score, submit, totalQuestions, wrongCardIds } from './engine'

const cards: Card[] = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, setId: 's', position: i, term: `term ${i}`, definition: `definition ${i}`, starred: false, suspended: false, createdAt: 0, updatedAt: 0 }))

describe('test engine', () => {
  it('creates a numbered test and tracks answered count', () => {
    const t = createTest(cards, { ...DEFAULT_TEST_SETUP, count: 12 }, 3)
    expect(totalQuestions(t.questions)).toBe(12)
    const nums = Object.values(t.numbers)
    expect(nums[0]).toBe('1')
    expect(nums.some((n) => n.includes('-'))).toBe(true)
    expect(answeredCount(t)).toBe(0)
    const mc = t.questions.find((q) => q.type === 'multipleChoice')!
    const t2 = respond(t, mc.id, { type: 'multipleChoice', index: 0 })
    expect(answeredCount(t2)).toBe(1)
  })

  it('submits, scores and builds a redemption round from wrong cards', () => {
    let t = createTest(cards, { count: 6, answerWith: 'definition', types: { ...DEFAULT_TEST_SETUP.types, matching: false, trueFalse: false, multipleChoice: false } }, 1)
    expect(t.questions.every((q) => q.type === 'written')).toBe(true)
    t.questions.forEach((q, i) => {
      if (q.type === 'written') t = respond(t, q.id, { type: 'written', text: i % 2 === 0 ? q.answer : 'nope' })
    })
    t = submit(t, { strictness: 'moderate' })
    const s = score(t)
    expect(s.total).toBe(6)
    expect(s.correct).toBe(3)
    expect(s.percent).toBe(50)
    expect(wrongCardIds(t)).toHaveLength(3)
    const r = redemption(t, cards, { count: 6, answerWith: 'definition', types: { ...DEFAULT_TEST_SETUP.types, matching: false, trueFalse: false, multipleChoice: false } })
    expect(r).not.toBeNull()
    expect(totalQuestions(r!.questions)).toBe(3)
  })
})
