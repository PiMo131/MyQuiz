import { describe, expect, it } from 'vitest'
import type { Card } from './types'
import {
  emptyResponse,
  generateTest,
  gradeQuestion,
  isAnswered,
  makeFillBlank,
  makeMatching,
  makeMultiSelect,
  makeMultipleChoice,
  makeOrdering,
  makeTrueFalse,
  makeWritten,
  pickDistractors,
  pickPromptSide,
  questionWeight,
} from './question-generator'
import { mulberry32 } from './text'

function card(i: number, extra: Partial<Card> = {}): Card {
  return {
    id: `c${i}`,
    setId: 's',
    position: i,
    term: `term ${i}`,
    definition: `definition number ${i}`,
    starred: false,
    suspended: false,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}
const cards = Array.from({ length: 10 }, (_, i) => card(i))

describe('question-generator', () => {
  it('builds multiple choice with 4 unique options including the answer', () => {
    const q = makeMultipleChoice(cards[0], cards, { answerWith: 'definition', seed: 7 })
    expect(q.options).toHaveLength(4)
    expect(new Set(q.options.map((o) => o.text)).size).toBe(4)
    expect(q.options[q.correctIndex].text).toBe('definition number 0')
    expect(q.prompt).toBe('term 0')
    expect(q.variant).toBe('forward')
  })

  it('uses card.distractors first', () => {
    const c = card(0, { distractors: ['wrong a', 'wrong b', 'wrong c'] })
    const q = makeMultipleChoice(c, [c, ...cards.slice(1)], { answerWith: 'definition', seed: 1 })
    const texts = q.options.map((o) => o.text)
    expect(texts).toEqual(expect.arrayContaining(['wrong a', 'wrong b', 'wrong c', 'definition number 0']))
  })

  it('never duplicates distractors that equal the answer', () => {
    const dup = card(5, { definition: 'definition number 0' })
    const pool = [cards[0], dup, ...cards.slice(1, 4)]
    const d = pickDistractors(cards[0], pool, 3, 'definition', mulberry32(3))
    expect(d.map((o) => o.text)).not.toContain('definition number 0')
    expect(new Set(d.map((o) => o.text)).size).toBe(d.length)
  })

  it('prefers distractors with a similar length', () => {
    const target = card(0, { definition: 'short' })
    const pool = [target, card(1, { definition: 'a very very long definition text indeed' }), card(2, { definition: 'tiny' }), card(3, { definition: 'small' }), card(4, { definition: 'also extremely long definition text here' })]
    const d = pickDistractors(target, pool, 2, 'definition', mulberry32(1))
    expect(d.map((o) => o.text).sort()).toEqual(['small', 'tiny'])
  })

  it('answer with term shows definition as prompt', () => {
    const rng = mulberry32(1)
    expect(pickPromptSide('term', rng)).toBe('definition')
    expect(pickPromptSide('definition', rng)).toBe('term')
    const q = makeWritten(cards[2], { answerWith: 'term', seed: 1 })
    expect(q.prompt).toBe('definition number 2')
    expect(q.answer).toBe('term 2')
    expect(q.variant).toBe('reverse')
  })

  it('is deterministic with a seed', () => {
    const a = generateTest(cards, { count: 10, types: ['multipleChoice', 'trueFalse', 'written', 'matching'], answerWith: 'both', seed: 42 })
    const b = generateTest(cards, { count: 10, types: ['multipleChoice', 'trueFalse', 'written', 'matching'], answerWith: 'both', seed: 42 })
    expect(a.map((q) => ({ ...q, id: '' }))).toEqual(b.map((q) => ({ ...q, id: '' })))
  })

  it('true/false pairs randomly and grades correctly', () => {
    const qs = Array.from({ length: 20 }, (_, i) => makeTrueFalse(cards[i % 10], cards, { answerWith: 'definition', seed: i }))
    expect(qs.some((q) => q.isTrue)).toBe(true)
    expect(qs.some((q) => !q.isTrue)).toBe(true)
    for (const q of qs) {
      if (q.isTrue) expect(q.shown).toBe(q.answer)
      else expect(q.shown).not.toBe(q.answer)
      expect(gradeQuestion(q, { type: 'trueFalse', value: q.isTrue }).correct).toBe(true)
      expect(gradeQuestion(q, { type: 'trueFalse', value: !q.isTrue }).correct).toBe(false)
    }
  })

  it('builds matching groups and grades per card', () => {
    const q = makeMatching(cards.slice(0, 4), { answerWith: 'definition', seed: 3 })
    expect(q.pairs).toHaveLength(4)
    expect(q.options).toHaveLength(4)
    expect(questionWeight(q)).toBe(4)
    const right = gradeQuestion(q, { type: 'matching', slots: q.pairs.map((p) => p.cardId) })
    expect(right.correct).toBe(true)
    const partial = gradeQuestion(q, { type: 'matching', slots: [q.pairs[1].cardId, q.pairs[0].cardId, q.pairs[2].cardId, q.pairs[3].cardId] })
    expect(partial.correct).toBe(false)
    expect(partial.perCard.filter((x) => x.correct)).toHaveLength(2)
  })

  it('builds ordering with a shuffled order and grades', () => {
    const q = makeOrdering(cards.slice(0, 4), { answerWith: 'definition', seed: 5 })
    expect(q.correctOrder).toEqual(['c0', 'c1', 'c2', 'c3'])
    expect(q.items.map((i) => i.cardId)).not.toEqual(q.correctOrder)
    expect(gradeQuestion(q, { type: 'ordering', order: q.correctOrder }).correct).toBe(true)
    expect(gradeQuestion(q, emptyResponse(q)).correct).toBe(false)
  })

  it('builds multi-select with several correct options', () => {
    const q = makeMultiSelect(cards.slice(0, 2), cards, { answerWith: 'definition', seed: 9 })
    expect(q.options.filter((o) => o.correct)).toHaveLength(2)
    expect(q.options.length).toBeGreaterThanOrEqual(4)
    const correctIdx = q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0)
    expect(gradeQuestion(q, { type: 'multiSelect', selected: correctIdx }).correct).toBe(true)
    expect(gradeQuestion(q, { type: 'multiSelect', selected: [correctIdx[0]] }).correct).toBe(false)
  })

  it('builds fill-in-the-blank from cloze cards', () => {
    const c = card(0, { term: '', definition: '', cloze: 'The capital of {{c1::France}} is {{c2::Paris::city}}.' })
    const q = makeFillBlank(c, 2)!
    expect(q.prompt).toBe('The capital of France is [city].')
    expect(q.accepted).toEqual(['Paris'])
    expect(q.variant).toBe('cloze:2')
    expect(gradeQuestion(q, { type: 'fillBlank', text: 'paris' }).correct).toBe(true)
    expect(makeFillBlank(cards[1], 1)).toBeUndefined()
  })

  it('generateTest spreads the count across types and skips fillBlank without cloze cards', () => {
    const qs = generateTest(cards, { count: 8, types: ['trueFalse', 'multipleChoice', 'written', 'fillBlank'], answerWith: 'both', seed: 1 })
    const total = qs.reduce((n, q) => n + questionWeight(q), 0)
    expect(total).toBe(8)
    expect(qs.filter((q) => q.type === 'fillBlank')).toHaveLength(0)
    const types = qs.map((q) => q.type)
    expect(types.filter((t) => t === 'trueFalse').length).toBeGreaterThanOrEqual(2)
    expect(types.filter((t) => t === 'written').length).toBeGreaterThanOrEqual(2)
    // sections are grouped in order
    expect(types.join(',')).toMatch(/^(trueFalse,)+(multipleChoice,)+(written,?)+$/)
  })

  it('generateTest never exceeds the number of cards and uses matching groups of 3–6', () => {
    const qs = generateTest(cards.slice(0, 5), { count: 50, types: ['matching'], answerWith: 'definition', seed: 2 })
    expect(qs).toHaveLength(1)
    expect(qs[0].type === 'matching' && qs[0].pairs.length).toBe(5)
  })

  it('written grading accepts alternatives and reports answered state', () => {
    const c = card(0, { definition: 'colour', altAnswers: ['color'] })
    const q = makeWritten(c, { answerWith: 'definition', seed: 1 })
    expect(q.accepted).toEqual(['colour', 'color'])
    expect(gradeQuestion(q, { type: 'written', text: 'color' }).correct).toBe(true)
    expect(isAnswered(q, { type: 'written', text: '' })).toBe(false)
    expect(isAnswered(q, { type: 'written', text: 'x' })).toBe(true)
  })
})
