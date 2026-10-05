/**
 * Public API of the AI feature (stub, implementation follows).
 * Everything degrades to heuristics; no network call happens without explicit user configuration.
 */
import type { Card, QuestionType } from '@/domain/types'
import { gradeAnswer } from '@/domain/grading'

export interface GeneratedCard { term: string; definition: string; hint?: string }
export interface GenerateOptions { lang?: string; count?: number; style?: 'termDefinition' | 'qa' | 'cloze'; signal?: AbortSignal }

export async function generateCards(text: string, opts: GenerateOptions = {}): Promise<GeneratedCard[]> {
  const { extractCards } = await import('@/domain/ai/cards')
  return extractCards(text, { max: opts.count ?? 30 })
}

export async function generateDistractors(card: Card, pool: Card[], n = 3): Promise<string[]> {
  const { pickDistractors } = await import('@/domain/ai/distractors')
  return pickDistractors(card, pool, n)
}

export async function explainAnswer(input: { card: Card; givenAnswer?: string; questionType?: QuestionType; lang?: string }): Promise<string> {
  const { explainTemplate } = await import('@/domain/ai/explain')
  return explainTemplate(input.card, input.givenAnswer ?? '', input.lang ?? 'nl')
}

export async function smartGrade(given: string, expected: string, _lang?: string): Promise<{ correct: boolean; confidence: number }> {
  const r = gradeAnswer(given, expected)
  return { correct: r.correct, confidence: r.correct ? 1 : 1 - r.similarity }
}

export function useAiStatus() {
  return { provider: 'heuristics' as const, ready: true, label: 'Basic' }
}

export function ExplainButton(_props: { card: Card; givenAnswer?: string; questionType?: QuestionType }) {
  return null
}
export function AskAiPanel(_props: { setId: string }) {
  return null
}
export function AiSettingsPanel() {
  return null
}
