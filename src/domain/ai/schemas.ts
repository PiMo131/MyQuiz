/**
 * JSON schemas for structured LLM output + tolerant parsers/validators.
 * Schemas are plain objects (passed to Chrome `responseConstraint`, WebLLM `response_format.schema`,
 * or embedded into the prompt for plain chat APIs).
 */
import type { ExtractedCard } from './cards'
import type { StudyGuide } from './studyGuide'
import type { PracticeQuestion } from './practiceTest'
import type { ScriptSegment } from './script'

export type JsonSchema = Record<string, unknown>

export const cardsSchema: JsonSchema = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: { term: { type: 'string' }, definition: { type: 'string' }, hint: { type: 'string' } },
        required: ['term', 'definition'],
      },
    },
  },
  required: ['cards'],
}

export const distractorsSchema: JsonSchema = {
  type: 'object',
  properties: { distractors: { type: 'array', items: { type: 'string' } } },
  required: ['distractors'],
}

export const gradeSchema: JsonSchema = {
  type: 'object',
  properties: { correct: { type: 'boolean' }, confidence: { type: 'number' } },
  required: ['correct'],
}

export const studyGuideSchema: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    outline: {
      type: 'array',
      items: { type: 'object', properties: { heading: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } }, required: ['heading', 'points'] },
    },
    keyTerms: { type: 'array', items: { type: 'object', properties: { term: { type: 'string' }, definition: { type: 'string' } }, required: ['term'] } },
    summary: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } }, required: ['question', 'answer'] } },
  },
  required: ['title', 'outline', 'keyTerms', 'summary', 'questions'],
}

export const practiceTestSchema: JsonSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['multipleChoice', 'written', 'trueFalse'] },
          prompt: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          statement: { type: 'string' },
        },
        required: ['type', 'prompt', 'answer'],
      },
    },
  },
  required: ['questions'],
}

export const scriptSchema: JsonSchema = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kind: { type: 'string', enum: ['intro', 'term', 'definition', 'line', 'recap', 'outro'] }, text: { type: 'string' }, cardIndex: { type: 'integer' } },
        required: ['kind', 'text'],
      },
    },
  },
  required: ['segments'],
}

/** Extract the first JSON object/array from an LLM reply (handles code fences and chatter). */
export function extractJson(raw: string): unknown {
  let s = raw.trim()
  // strip <think>…</think> blocks (Qwen) and code fences
  s = s.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s)
  if (fence) s = fence[1].trim()
  const start = Math.min(...['{', '['].map((c) => s.indexOf(c)).filter((i) => i >= 0))
  if (!Number.isFinite(start)) throw new Error('No JSON found')
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  const end = s.lastIndexOf(close)
  const slice = end > start ? s.slice(start, end + 1) : s.slice(start)
  try {
    return JSON.parse(slice)
  } catch {
    // try to repair a truncated array/object by cutting at the last complete element
    const lastComma = slice.lastIndexOf('},')
    if (lastComma > 0) return JSON.parse(slice.slice(0, lastComma + 1) + (open === '{' ? ']}' : ']'))
    throw new Error('Invalid JSON')
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function parseCards(raw: string): ExtractedCard[] {
  const j = extractJson(raw)
  const arr = Array.isArray(j) ? j : isObj(j) && Array.isArray(j.cards) ? j.cards : []
  const out: ExtractedCard[] = []
  for (const it of arr) {
    if (!isObj(it)) continue
    const term = str(it.term) ?? str(it.front) ?? str(it.question)
    const definition = str(it.definition) ?? str(it.back) ?? str(it.answer)
    if (term && definition) out.push({ term, definition, hint: str(it.hint) })
  }
  return out
}

export function parseStrings(raw: string, key = 'distractors'): string[] {
  const j = extractJson(raw)
  const arr = Array.isArray(j) ? j : isObj(j) && Array.isArray(j[key]) ? j[key] : []
  return (arr as unknown[]).map(str).filter((s): s is string => !!s)
}

export function parseGrade(raw: string): { correct: boolean; confidence: number } | null {
  try {
    const j = extractJson(raw)
    if (!isObj(j) || typeof j.correct !== 'boolean') return null
    const c = typeof j.confidence === 'number' ? Math.min(1, Math.max(0, j.confidence)) : 0.8
    return { correct: j.correct, confidence: c }
  } catch {
    const t = raw.trim().toLowerCase()
    if (/^(yes|ja|correct|true)\b/.test(t)) return { correct: true, confidence: 0.6 }
    if (/^(no|nee|incorrect|false|wrong)\b/.test(t)) return { correct: false, confidence: 0.6 }
    return null
  }
}

export function parseStudyGuide(raw: string, fallbackTitle: string): Omit<StudyGuide, 'cards'> {
  const j = extractJson(raw)
  if (!isObj(j)) throw new Error('Invalid study guide')
  const outline = Array.isArray(j.outline)
    ? j.outline.filter(isObj).map((s) => ({ heading: str(s.heading) ?? '', points: Array.isArray(s.points) ? s.points.map(str).filter((p): p is string => !!p) : [] })).filter((s) => s.heading)
    : []
  const keyTerms = Array.isArray(j.keyTerms)
    ? j.keyTerms.filter(isObj).map((k) => ({ term: str(k.term) ?? '', definition: str(k.definition) })).filter((k) => k.term)
    : []
  const summary = Array.isArray(j.summary) ? j.summary.map(str).filter((s): s is string => !!s) : typeof j.summary === 'string' ? [j.summary] : []
  const questions = Array.isArray(j.questions)
    ? j.questions.filter(isObj).map((q) => ({ question: str(q.question) ?? '', answer: str(q.answer) ?? '' })).filter((q) => q.question && q.answer)
    : []
  return { title: str(j.title) ?? fallbackTitle, outline, keyTerms, summary, questions }
}

export function parsePracticeTest(raw: string): PracticeQuestion[] {
  const j = extractJson(raw)
  const arr = Array.isArray(j) ? j : isObj(j) && Array.isArray(j.questions) ? j.questions : []
  const out: PracticeQuestion[] = []
  arr.forEach((q: unknown, i: number) => {
    if (!isObj(q)) return
    const type = q.type === 'multipleChoice' || q.type === 'written' || q.type === 'trueFalse' ? q.type : 'written'
    const prompt = str(q.prompt) ?? str(q.question)
    let answer = str(q.answer)
    if (!prompt || !answer) return
    const options = Array.isArray(q.options) ? q.options.map(str).filter((s): s is string => !!s) : undefined
    if (type === 'multipleChoice' && (!options || options.length < 2)) return
    if (type === 'multipleChoice' && options && !options.includes(answer)) options[0] = answer
    if (type === 'trueFalse') {
      const a = answer.toLowerCase()
      answer = a === 'true' || a === 'waar' || a === 'yes' || a === 'ja' ? 'true' : 'false'
    }
    out.push({ id: `q${i + 1}`, type, prompt, answer, options: type === 'multipleChoice' ? options : undefined, statement: type === 'trueFalse' ? str(q.statement) ?? prompt : undefined })
  })
  return out
}

export function parseScript(raw: string, lang: string, cardIds: readonly string[]): ScriptSegment[] {
  const j = extractJson(raw)
  const arr = Array.isArray(j) ? j : isObj(j) && Array.isArray(j.segments) ? j.segments : []
  const out: ScriptSegment[] = []
  arr.forEach((s: unknown, i: number) => {
    if (!isObj(s)) return
    const text = str(s.text)
    if (!text) return
    const kind = (['intro', 'term', 'definition', 'line', 'recap', 'outro'] as const).find((k) => k === s.kind) ?? 'line'
    const idx = typeof s.cardIndex === 'number' ? s.cardIndex : undefined
    out.push({ id: `s${i}`, kind, text, lang, cardId: idx !== undefined ? cardIds[idx] : undefined, pauseMs: kind === 'term' ? 1500 : 400 })
  })
  return out
}
