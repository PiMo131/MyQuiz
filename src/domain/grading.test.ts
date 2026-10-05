import { describe, expect, it } from 'vitest'
import { diffAnswer, gradeAnswer } from './grading'

describe('gradeAnswer', () => {
  it('accepts exact match', () => {
    expect(gradeAnswer('hond', 'hond').correct).toBe(true)
  })
  it('ignores case, accents and punctuation by default (moderate)', () => {
    expect(gradeAnswer('Cafe!', 'café', { strictness: 'moderate' }).correct).toBe(true)
  })
  it('allows a typo in moderate mode', () => {
    expect(gradeAnswer('photosyntesis', 'photosynthesis', { strictness: 'moderate' }).correct).toBe(true)
  })
  it('rejects typos in strict mode but ignores parentheses', () => {
    expect(gradeAnswer('photosyntesis', 'photosynthesis', { strictness: 'strict' }).correct).toBe(false)
    expect(gradeAnswer('Paris', 'Paris (France)', { strictness: 'strict' }).correct).toBe(true)
  })
  it('accepts alternatives separated by /', () => {
    expect(gradeAnswer('cat', 'kat / cat').correct).toBe(true)
    expect(gradeAnswer('kat', 'kat / cat').correct).toBe(true)
  })
  it('relaxed accepts rephrasing containing all key tokens', () => {
    expect(gradeAnswer('you should take short breaks', 'take breaks', { strictness: 'relaxed' }).correct).toBe(true)
  })
  it('rejects clearly wrong answers', () => {
    expect(gradeAnswer('dog', 'elephant').correct).toBe(false)
  })
  it('strips markdown from expected', () => {
    expect(gradeAnswer('bold', '**bold**').correct).toBe(true)
  })
})

describe('diffAnswer', () => {
  it('marks missing and extra characters', () => {
    const d = diffAnswer('Why take breaks', 'Why should you take breaks?')
    expect(d.expected.some((p) => p.type === 'missing')).toBe(true)
    expect(d.given.filter((p) => p.type === 'extra').map((p) => p.text).join('')).toBe('')
  })
})
