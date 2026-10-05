import { describe, expect, it } from 'vitest'
import { cardsPrompt, distractorsPrompt, gradePrompt, studyGuidePrompt } from './prompts'
import { extractJson, parseCards, parseGrade, parsePracticeTest, parseStudyGuide } from './schemas'
import { detectLang, langName } from './lang'

describe('prompt builders', () => {
  it('cardsPrompt is English, names the output language and carries a schema', () => {
    const p = cardsPrompt('Fotosynthese: ...', { lang: 'nl', count: 10, style: 'termDefinition' })
    expect(p.system).toContain('Dutch')
    expect(p.system).toContain('JSON')
    expect(p.user).toContain('10 flashcards')
    expect(p.schema).toBeDefined()
    expect(p.maxTokens).toBeGreaterThan(100)
  })
  it('distractorsPrompt lists existing options', () => {
    const p = distractorsPrompt({ term: 'hond', definition: 'dog' }, ['cat'], 3, 'en')
    expect(p.user).toContain('cat')
    expect(p.user).toContain('Give 3 distractors')
  })
  it('gradePrompt is deterministic', () => {
    expect(gradePrompt('a', 'b').temperature).toBe(0)
  })
  it('studyGuidePrompt truncates long input', () => {
    const p = studyGuidePrompt('x'.repeat(20000))
    expect(p.user.length).toBeLessThan(13000)
  })
})

describe('json parsing', () => {
  it('extracts JSON from fenced and chatty replies', () => {
    expect(extractJson('Sure! ```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('<think>hmm</think>{"a":[1,2]}')).toEqual({ a: [1, 2] })
  })
  it('parses cards with alternative keys', () => {
    const cards = parseCards(
      '{"cards":[{"term":"a","definition":"b"},{"front":"c","back":"d"},{"term":"","definition":"x"}]}',
    )
    expect(cards).toEqual([
      { term: 'a', definition: 'b', hint: undefined },
      { term: 'c', definition: 'd', hint: undefined },
    ])
  })
  it('parses grade incl. plain yes/no fallback', () => {
    expect(parseGrade('{"correct":true,"confidence":0.9}')).toEqual({ correct: true, confidence: 0.9 })
    expect(parseGrade('No, that is wrong')).toEqual({ correct: false, confidence: 0.6 })
  })
  it('parses a study guide and a practice test', () => {
    const g = parseStudyGuide(
      '{"title":"T","outline":[{"heading":"H","points":["p"]}],"keyTerms":[{"term":"k"}],"summary":"s","questions":[{"question":"q","answer":"a"}]}',
      'fb',
    )
    expect(g.summary).toEqual(['s'])
    expect(g.outline[0].heading).toBe('H')
    const qs = parsePracticeTest(
      '{"questions":[{"type":"multipleChoice","prompt":"p","options":["x","y","z","a"],"answer":"a"},{"type":"trueFalse","prompt":"s","answer":"waar"}]}',
    )
    expect(qs).toHaveLength(2)
    expect(qs[1].answer).toBe('true')
  })
})

describe('lang', () => {
  it('detects nl vs en', () => {
    expect(detectLang('De kat zit op de mat en het is een mooie dag')).toBe('nl')
    expect(detectLang('The cat is on the mat and it is a nice day')).toBe('en')
  })
  it('names languages', () => {
    expect(langName('nl-NL')).toBe('Dutch')
    expect(langName(undefined)).toContain('same language')
  })
})
