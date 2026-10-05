/**
 * High-level AI functions used by other features. Each one tries the active LLM provider and
 * always falls back to the pure heuristics in domain/ai.
 */
import type { Card, QuestionType } from '@/domain/types'
import { gradeAnswer } from '@/domain/grading'
import { useSettings } from '@/app/settings-store'
import { applyCardStyle, extractCards, type CardStyle, type ExtractedCard } from '@/domain/ai/cards'
import { pickDistractors } from '@/domain/ai/distractors'
import { explainTemplate } from '@/domain/ai/explain'
import { cardsPrompt, distractorsPrompt, explainPrompt, gradePrompt } from '@/domain/ai/prompts'
import { parseCards, parseGrade, parseStrings } from '@/domain/ai/schemas'
import { detectLang } from '@/domain/ai/lang'
import { dedupeKey } from '@/domain/ai/textUtil'
import { chatStream, promptMessages, resolveProvider, runPromptOrFallback } from './providers/router'
import type { ActiveProviderKind } from './providers/types'

export type GeneratedCard = ExtractedCard

export interface GenerateOptions {
  lang?: string
  count?: number
  style?: CardStyle
  signal?: AbortSignal
  /** Force heuristics even when a provider is available. */
  heuristicsOnly?: boolean
}

export interface GenerateResult {
  cards: GeneratedCard[]
  provider: ActiveProviderKind
}

/** Generate flashcards from free text. Returns cards plus which provider produced them. */
export async function generateCardsDetailed(
  text: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const count = opts.count ?? 30
  const style = opts.style ?? 'termDefinition'
  const lang = opts.lang || detectLang(text) || useSettings.getState().settings.locale
  const heuristic = () => applyCardStyle(extractCards(text, { max: count }), style, lang)
  if (opts.heuristicsOnly) return { cards: heuristic(), provider: 'heuristics' }
  const { value, provider } = await runPromptOrFallback(
    cardsPrompt(text, { lang, count, style }),
    (raw) => {
      const cards = parseCards(raw)
      const seen = new Set<string>()
      return cards
        .filter((c) => {
          const k = dedupeKey(c.term)
          if (!k || seen.has(k)) return false
          seen.add(k)
          return true
        })
        .slice(0, count)
    },
    heuristic,
    { signal: opts.signal, accept: (cards) => cards.length > 0 },
  )
  return {
    cards:
      provider === 'heuristics' ? value : style === 'cloze' ? applyCardStyle(value, 'cloze', lang) : value,
    provider,
  }
}

export async function generateCards(text: string, opts: GenerateOptions = {}): Promise<GeneratedCard[]> {
  return (await generateCardsDetailed(text, opts)).cards
}

/**
 * Distractors for a card. Heuristic first (instant); when the pool is too small (< n usable
 * alternatives) and a provider is available, ask the LLM for the missing ones.
 */
export async function generateDistractors(
  card: Card,
  pool: Card[],
  n = 3,
  opts: { signal?: AbortSignal; side?: 'term' | 'definition' } = {},
): Promise<string[]> {
  const heuristic = pickDistractors(card, pool, n, { side: opts.side })
  if (heuristic.length >= n) return heuristic
  const provider = await resolveProvider().catch(() => null)
  if (!provider) return heuristic
  try {
    const lang = opts.side === 'term' ? useSettings.getState().settings.locale : undefined
    const { value } = await runPromptOrFallback(
      distractorsPrompt(card, heuristic, n - heuristic.length, lang),
      (raw) => parseStrings(raw),
      () => [],
      { signal: opts.signal },
    )
    const seen = new Set([dedupeKey(card.definition), ...heuristic.map(dedupeKey)])
    const out = [...heuristic]
    for (const d of value) {
      const k = dedupeKey(d)
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(d)
      if (out.length >= n) break
    }
    return out
  } catch {
    return heuristic
  }
}

export interface ExplainInput {
  card: Card
  givenAnswer?: string
  questionType?: QuestionType
  lang?: string
  side?: 'term' | 'definition'
  signal?: AbortSignal
}

/** Streaming explanation. Yields text chunks; heuristics yield the template in one go. */
export async function* explainAnswerStream(input: ExplainInput): AsyncGenerator<string, ActiveProviderKind> {
  const lang = input.lang ?? useSettings.getState().settings.locale
  const provider = await resolveProvider().catch(() => null)
  if (provider) {
    const p = explainPrompt({ card: input.card, givenAnswer: input.givenAnswer, lang, side: input.side })
    let got = ''
    try {
      for await (const chunk of chatStream(promptMessages(p), {
        maxTokens: p.maxTokens,
        temperature: p.temperature,
        signal: input.signal,
      })) {
        got += chunk
        yield chunk
      }
      if (got.trim()) return provider.kind
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      if (got.trim()) return provider.kind
    }
  }
  yield explainTemplate({
    card: input.card,
    givenAnswer: input.givenAnswer,
    questionType: input.questionType,
    lang,
    side: input.side,
  })
  return 'heuristics'
}

/** Non-streaming explanation (convenience). */
export async function explainAnswer(input: ExplainInput): Promise<string> {
  let out = ''
  const it = explainAnswerStream(input)
  for (;;) {
    const r = await it.next()
    if (r.done) break
    out += r.value
  }
  return out
}

export interface SmartGradeResult {
  correct: boolean
  confidence: number
  provider: ActiveProviderKind
}

/**
 * Grade a free-text answer. Uses domain/grading first; only when that is uncertain
 * (near miss or long paraphrase) and an LLM is available, ask it for a yes/no.
 */
export async function smartGrade(
  given: string,
  expected: string | string[],
  lang?: string,
  signal?: AbortSignal,
): Promise<SmartGradeResult> {
  const grading = useSettings.getState().settings.grading
  const r = gradeAnswer(given, expected, grading)
  if (r.correct) return { correct: true, confidence: 1, provider: 'heuristics' }
  const expectedStr = Array.isArray(expected) ? (expected[0] ?? '') : expected
  const words = (s: string) => s.trim().split(/\s+/).length
  const uncertain =
    (r.similarity >= 0.45 && r.similarity < 1) || (words(given) >= 3 && words(expectedStr) >= 3)
  if (!uncertain || !given.trim())
    return { correct: false, confidence: 1 - r.similarity, provider: 'heuristics' }
  const provider = await resolveProvider().catch(() => null)
  if (!provider) return { correct: false, confidence: 1 - r.similarity, provider: 'heuristics' }
  const { value, provider: used } = await runPromptOrFallback(
    gradePrompt(given, expectedStr, lang ?? useSettings.getState().settings.locale),
    (raw) => parseGrade(raw),
    () => null,
    { signal, accept: (v) => v !== null },
  )
  if (!value) return { correct: false, confidence: 1 - r.similarity, provider: 'heuristics' }
  return { correct: value.correct, confidence: value.confidence, provider: used }
}
