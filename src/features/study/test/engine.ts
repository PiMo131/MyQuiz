/** Test mode engine (pure): build, answer, grade, redemption round. */
import type { Card, GradingOptions, Id, QuestionType } from '@/domain/types'
import {
  generateTest,
  gradeQuestion,
  isAnswered,
  questionCardIds,
  questionWeight,
  type AnswerWith,
  type GradeOutcome,
  type Question,
  type Response,
} from '@/domain/question-generator'

export interface TestSetup {
  count: number
  answerWith: AnswerWith
  types: Record<QuestionType, boolean>
}

export const DEFAULT_TEST_SETUP: TestSetup = {
  count: 20,
  answerWith: 'both',
  types: { trueFalse: true, multipleChoice: true, matching: true, written: true, ordering: false, multiSelect: false, fillBlank: false, flashcard: false },
}

export interface TestState {
  questions: Question[]
  responses: Record<string, Response>
  submitted: boolean
  results: Record<string, GradeOutcome>
  /** 1-based question number ranges per question id, e.g. "7-9". */
  numbers: Record<string, string>
  startedAt: number
}

export function enabledTypes(setup: TestSetup): QuestionType[] {
  return (Object.keys(setup.types) as QuestionType[]).filter((k) => setup.types[k])
}

export function createTest(cards: Card[], setup: TestSetup, seed = Date.now() % 1_000_000, now = Date.now()): TestState {
  const questions = generateTest(cards, { count: setup.count, types: enabledTypes(setup), answerWith: setup.answerWith, seed })
  return { questions, responses: {}, submitted: false, results: {}, numbers: numberQuestions(questions), startedAt: now }
}

export function numberQuestions(questions: Question[]): Record<string, string> {
  const out: Record<string, string> = {}
  let n = 1
  for (const q of questions) {
    const w = questionWeight(q)
    out[q.id] = w > 1 ? `${n}-${n + w - 1}` : String(n)
    n += w
  }
  return out
}

export function totalQuestions(questions: Question[]): number {
  return questions.reduce((s, q) => s + questionWeight(q), 0)
}

export function respond(state: TestState, id: string, response: Response): TestState {
  if (state.submitted) return state
  return { ...state, responses: { ...state.responses, [id]: response } }
}

export function answeredCount(state: TestState): number {
  return state.questions.filter((q) => isAnswered(q, state.responses[q.id])).reduce((s, q) => s + questionWeight(q), 0)
}

export interface TestScore {
  correct: number
  total: number
  percent: number
}

export function submit(state: TestState, grading: Partial<GradingOptions>): TestState {
  const results: Record<string, GradeOutcome> = {}
  for (const q of state.questions) results[q.id] = gradeQuestion(q, state.responses[q.id], grading)
  return { ...state, submitted: true, results }
}

export function score(state: TestState): TestScore {
  let correct = 0
  let total = 0
  for (const q of state.questions) {
    const r = state.results[q.id]
    if (!r) continue
    total += r.perCard.length
    correct += r.perCard.filter((x) => x.correct).length
  }
  return { correct, total, percent: total ? Math.round((correct / total) * 100) : 0 }
}

/** Card ids that had at least one wrong outcome. */
export function wrongCardIds(state: TestState): Id[] {
  const ids = new Set<Id>()
  for (const q of state.questions) {
    const r = state.results[q.id]
    if (!r) continue
    for (const pc of r.perCard) if (!pc.correct) ids.add(pc.cardId)
  }
  return [...ids]
}

/** New test with only the cards that went wrong ("redemption round"). */
export function redemption(state: TestState, cards: Card[], setup: TestSetup, seed = Date.now() % 1_000_000): TestState | null {
  const wrong = new Set(wrongCardIds(state))
  const subset = cards.filter((c) => wrong.has(c.id))
  if (!subset.length) return null
  return createTest(subset, { ...setup, count: Math.max(subset.length, Math.min(setup.count, subset.length)) }, seed)
}

/** Per-card outcomes (for recordOutcome). */
export function cardOutcomes(state: TestState): Array<{ cardId: Id; correct: boolean; questionType: QuestionType }> {
  const out: Array<{ cardId: Id; correct: boolean; questionType: QuestionType }> = []
  for (const q of state.questions) {
    const r = state.results[q.id]
    if (!r) continue
    for (const pc of r.perCard) if (questionCardIds(q).includes(pc.cardId)) out.push({ cardId: pc.cardId, correct: pc.correct, questionType: q.type })
  }
  return out
}
