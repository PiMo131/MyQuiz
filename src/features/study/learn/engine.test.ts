import { describe, expect, it } from 'vitest'
import type { Card } from '@/domain/types'
import { mulberry32 } from '@/domain/text'
import { DEFAULT_LEARN_CONFIG, answerCurrent, createLearn, learnProgress, masteredCount, nextQuestion, questionTypeFor, roundFinished } from './engine'

function card(i: number): Card {
  return { id: `c${i}`, setId: 's', position: i, term: `term ${i}`, definition: `definition ${i}`, starred: i % 2 === 0, suspended: false, createdAt: 0, updatedAt: 0 }
}
const cards = Array.from({ length: 10 }, (_, i) => card(i))

describe('learn engine', () => {
  it('starts with 2N steps for memorize and N for cram', () => {
    const s = createLearn(cards, DEFAULT_LEARN_CONFIG, 1)
    expect(learnProgress(s)).toEqual({ done: 0, total: 20 })
    const c = createLearn(cards, { ...DEFAULT_LEARN_CONFIG, goal: 'cram' }, 1)
    expect(learnProgress(c).total).toBe(10)
  })

  it('asks multiple choice first, then written', () => {
    let s = nextQuestion(createLearn(cards, { ...DEFAULT_LEARN_CONFIG, shuffle: false }, 1), cards, mulberry32(1))
    expect(s.current?.type).toBe('multipleChoice')
    expect(s.round).toHaveLength(7)
    const id = s.current && 'cardId' in s.current ? s.current.cardId : ''
    s = answerCurrent(s, true)
    expect(s.cards[id].stage).toBe(1)
    expect(questionTypeFor(s, id)).toBe('written')
    // the card stays in the round (appended at the end)
    expect(s.round[s.round.length - 1]).toBe(id)
  })

  it('re-queues wrong answers later in the round', () => {
    let s = nextQuestion(createLearn(cards, { ...DEFAULT_LEARN_CONFIG, shuffle: false }, 1), cards, mulberry32(1))
    const id = s.current && 'cardId' in s.current ? s.current.cardId : ''
    s = answerCurrent(s, false)
    expect(s.cards[id].misses).toBe(1)
    expect(s.cards[id].stage).toBe(0)
    expect(s.round.indexOf(id)).toBe(2)
    expect(s.roundWrong).toBe(1)
  })

  it('masters all cards after enough correct answers and finishes rounds', () => {
    let s = createLearn(cards, { ...DEFAULT_LEARN_CONFIG, shuffle: false }, 1)
    const rng = mulberry32(5)
    let guard = 0
    let rounds = 0
    while (!s.done && guard++ < 200) {
      s = nextQuestion(s, cards, rng)
      if (s.done) break
      s = answerCurrent(s, true)
      if (roundFinished(s)) rounds++
    }
    expect(s.done).toBe(true)
    expect(masteredCount(s)).toBe(10)
    expect(learnProgress(s)).toEqual({ done: 20, total: 20 })
    expect(guard).toBe(20) // exactly 2 correct answers per card
    expect(rounds).toBeGreaterThanOrEqual(1)
  })

  it('respects starred only and disabled types', () => {
    const s = nextQuestion(createLearn(cards, { ...DEFAULT_LEARN_CONFIG, starredOnly: true, types: { multipleChoice: false, written: true, flashcard: false } }, 1), cards, mulberry32(1))
    expect(Object.keys(s.cards)).toHaveLength(5)
    expect(s.current?.type).toBe('written')
  })

  it('handles an empty set', () => {
    const s = nextQuestion(createLearn([], DEFAULT_LEARN_CONFIG, 1), [], mulberry32(1))
    expect(s.done).toBe(true)
    expect(s.current).toBeNull()
  })
})

describe('learn engine tiny sets', () => {
  it('a single card never gets a one-option multiple choice and the session terminates', () => {
    const one = [card(0)]
    let s = nextQuestion(createLearn(one, { ...DEFAULT_LEARN_CONFIG, shuffle: false }, 1), one, mulberry32(1))
    expect(s.current?.type).toBe('written')
    s = answerCurrent(s, true)
    s = nextQuestion(s, one, mulberry32(1))
    expect(s.current?.type).toBe('written')
    s = answerCurrent(s, true)
    expect(s.done).toBe(true)
    expect(masteredCount(s)).toBe(1)
    expect(nextQuestion(s, one, mulberry32(1)).current).toBeNull()
  })
  it('all cards suspended → done immediately, no question', () => {
    const all = cards.map((c) => ({ ...c, suspended: true }))
    const s = nextQuestion(createLearn(all, DEFAULT_LEARN_CONFIG, 1), all, mulberry32(1))
    expect(s.done).toBe(true)
    expect(s.current).toBeNull()
    expect(roundFinished(s)).toBe(false)
  })
  it('falls back to written when other cards have empty answers (no distractors)', () => {
    const list = [card(0), { ...card(1), definition: '' }, { ...card(2), definition: '' }]
    const s = nextQuestion(createLearn(list, { ...DEFAULT_LEARN_CONFIG, shuffle: false }, 1), list, mulberry32(1))
    expect(s.current?.type).toBe('written')
  })
})
