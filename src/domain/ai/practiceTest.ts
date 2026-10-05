/** Practice-test generation from cards (heuristic) and grading using the shared grading rules. */
import type { Card, GradingOptions, QuestionType } from '@/domain/types'
import { gradeAnswer } from '@/domain/grading'
import { plainText, shuffle } from '@/domain/text'
import { pickDistractorsFor } from './distractors'

export type PracticeQuestionType = Extract<QuestionType, 'multipleChoice' | 'written' | 'trueFalse'>

export interface PracticeQuestion {
  id: string
  type: PracticeQuestionType
  cardId?: string
  prompt: string
  /** Multiple choice options (plain text). */
  options?: string[]
  /** Correct answer (plain text). For trueFalse: 'true' | 'false'. */
  answer: string
  /** For trueFalse: the statement shown with the prompt. */
  statement?: string
  altAnswers?: string[]
}

export interface PracticeTestOptions {
  count?: number
  types?: PracticeQuestionType[]
  /** Ask for 'definition' given the term (default) or the other way round. */
  side?: 'term' | 'definition'
  rng?: () => number
}

export interface PracticeSource {
  term: string
  definition: string
  id?: string
  altAnswers?: string[]
}

export function buildPracticeTest(sources: readonly PracticeSource[], opts: PracticeTestOptions = {}): PracticeQuestion[] {
  const rng = opts.rng ?? Math.random
  const types = opts.types?.length ? opts.types : (['multipleChoice', 'written', 'trueFalse'] as PracticeQuestionType[])
  const side = opts.side ?? 'definition'
  const usable = sources.filter((s) => plainText(s.term) && plainText(s.definition))
  const count = Math.min(opts.count ?? 10, usable.length)
  const picked = shuffle(usable, rng).slice(0, count)
  const answersPool = usable.map((s) => (side === 'definition' ? s.definition : s.term))
  const out: PracticeQuestion[] = []
  picked.forEach((s, i) => {
    const type = types[i % types.length]
    const prompt = plainText(side === 'definition' ? s.term : s.definition)
    const answer = plainText(side === 'definition' ? s.definition : s.term)
    const id = `q${i + 1}`
    if (type === 'multipleChoice' && usable.length >= 2) {
      const d = pickDistractorsFor(answer, answersPool, 3, rng)
      out.push({ id, type, cardId: s.id, prompt, answer, options: shuffle([answer, ...d], rng) })
    } else if (type === 'trueFalse' && usable.length >= 2) {
      const isTrue = rng() < 0.5
      let statement = answer
      if (!isTrue) {
        const others = answersPool.filter((a) => plainText(a) !== answer)
        statement = plainText(others[Math.floor(rng() * others.length)] ?? answer)
        if (statement === answer) return out.push({ id, type: 'written', cardId: s.id, prompt, answer, altAnswers: s.altAnswers })
      }
      out.push({ id, type, cardId: s.id, prompt, statement, answer: statement === answer ? 'true' : 'false' })
    } else {
      out.push({ id, type: 'written', cardId: s.id, prompt, answer, altAnswers: s.altAnswers })
    }
  })
  return out
}

export function cardsToSources(cards: readonly Card[]): PracticeSource[] {
  return cards.filter((c) => !c.suspended).map((c) => ({ id: c.id, term: c.term, definition: c.definition, altAnswers: c.altAnswers }))
}

export interface PracticeGrade {
  correct: boolean
  expected: string
}

export function gradePracticeAnswer(q: PracticeQuestion, given: string, grading?: Partial<GradingOptions>): PracticeGrade {
  if (q.type === 'written') {
    const r = gradeAnswer(given, [q.answer, ...(q.altAnswers ?? [])], grading)
    return { correct: r.correct, expected: q.answer }
  }
  if (q.type === 'trueFalse') return { correct: given === q.answer, expected: q.answer }
  return { correct: plainText(given) === plainText(q.answer), expected: q.answer }
}

export function scoreTest(qs: readonly PracticeQuestion[], answers: Readonly<Record<string, string>>, grading?: Partial<GradingOptions>): { correct: number; total: number; results: Record<string, PracticeGrade> } {
  const results: Record<string, PracticeGrade> = {}
  let correct = 0
  for (const q of qs) {
    const g = gradePracticeAnswer(q, answers[q.id] ?? '', grading)
    results[q.id] = g
    if (g.correct) correct++
  }
  return { correct, total: qs.length, results }
}
