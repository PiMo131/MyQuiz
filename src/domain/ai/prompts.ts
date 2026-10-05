/**
 * Prompt builders. Prompts are always written in English (small local models follow English
 * instructions best); the desired output language is stated explicitly.
 */
import type { Card } from '@/domain/types'
import { plainText, truncate } from '@/domain/text'
import { langName } from './lang'
import { cardsSchema, distractorsSchema, gradeSchema, practiceTestSchema, scriptSchema, studyGuideSchema, type JsonSchema } from './schemas'
import type { CardStyle } from './cards'

export interface Prompt {
  system: string
  user: string
  schema?: JsonSchema
  maxTokens: number
  temperature: number
}

const JSON_RULE = 'Respond with JSON only, no prose, no markdown fences.'
const MAX_INPUT = 12_000

export function cardsPrompt(text: string, opts: { lang?: string; count: number; style: CardStyle }): Prompt {
  const styleRule =
    opts.style === 'qa'
      ? 'Each card is a question (term) and its answer (definition).'
      : opts.style === 'cloze'
        ? 'Each card: "term" is a key concept, "definition" is a full sentence from the notes that contains that concept.'
        : 'Each card: "term" is a concept or vocabulary word, "definition" is a concise explanation (max 25 words).'
  return {
    system: `You create study flashcards from notes. ${styleRule} Only use facts present in the notes. Write all output in ${langName(opts.lang)}. ${JSON_RULE} Schema: {"cards":[{"term":"","definition":"","hint":""}]}. "hint" is optional and short.`,
    user: `Create up to ${opts.count} flashcards from these notes:\n\n${truncate(text, MAX_INPUT)}`,
    schema: cardsSchema,
    maxTokens: Math.min(4000, 60 + opts.count * 60),
    temperature: 0.3,
  }
}

export function distractorsPrompt(card: Pick<Card, 'term' | 'definition'>, existing: readonly string[], n: number, lang?: string): Prompt {
  return {
    system: `You write plausible but clearly wrong multiple-choice options for a flashcard quiz. Options must be the same kind of thing as the correct answer, similar length, never a synonym or partial match of the correct answer. Write in ${langName(lang)}. ${JSON_RULE} Schema: {"distractors":["", ""]}`,
    user: `Question: ${plainText(card.term)}\nCorrect answer: ${plainText(card.definition)}\nAlready used (avoid): ${existing.map(plainText).join(' | ') || '-'}\nGive ${n} distractors.`,
    schema: distractorsSchema,
    maxTokens: 200,
    temperature: 0.7,
  }
}

export function explainPrompt(input: { card: Card; givenAnswer?: string; lang: string; side?: 'term' | 'definition' }): Prompt {
  const side = input.side ?? 'definition'
  const prompt = plainText(side === 'definition' ? input.card.term : input.card.definition)
  const answer = plainText(side === 'definition' ? input.card.definition : input.card.term)
  const extras = [input.card.hint && `Hint on card: ${plainText(input.card.hint)}`, input.card.example && `Example on card: ${plainText(input.card.example)}`, input.card.mnemonic && `Mnemonic on card: ${plainText(input.card.mnemonic)}`].filter(Boolean).join('\n')
  return {
    system: `You are a friendly tutor. Explain in at most 3 short sentences why the correct answer is right${input.givenAnswer ? ' and why the student\'s answer is not' : ''}. Add one memorable cue (example or mnemonic). Write in ${langName(input.lang)}. Use plain text or light markdown (bold), no headings, no lists.`,
    user: `Prompt: ${prompt}\nCorrect answer: ${answer}\n${input.givenAnswer ? `Student answered: ${plainText(input.givenAnswer)}\n` : ''}${extras}`,
    maxTokens: 220,
    temperature: 0.5,
  }
}

export function gradePrompt(given: string, expected: string, lang?: string): Prompt {
  return {
    system: `You judge whether a student's short answer means the same as the expected answer (same meaning, ignoring spelling, word order, articles). Answers are in ${langName(lang)}. ${JSON_RULE} Schema: {"correct":true,"confidence":0.9}`,
    user: `Expected: ${plainText(expected)}\nStudent: ${plainText(given)}`,
    schema: gradeSchema,
    maxTokens: 40,
    temperature: 0,
  }
}

export function studyGuidePrompt(text: string, lang?: string): Prompt {
  return {
    system: `You write a study guide from notes. Output JSON with: "title", "outline" (sections with heading and 2-5 bullet points), "keyTerms" (term + one-sentence definition, max 15), "summary" (3-5 sentences as array), "questions" (5-8 practice questions with answers). Only use facts from the notes. Write in ${langName(lang)}. ${JSON_RULE}`,
    user: truncate(text, MAX_INPUT),
    schema: studyGuideSchema,
    maxTokens: 2500,
    temperature: 0.3,
  }
}

export function practiceTestPrompt(source: string, opts: { count: number; types: string[]; lang?: string }): Prompt {
  return {
    system: `You write practice test questions from study material. Types allowed: ${opts.types.join(', ')}. For multipleChoice give exactly 4 "options" including the correct "answer". For trueFalse give a "statement" and "answer" "true" or "false". For written give "prompt" and a short "answer". Only use facts from the material. Write in ${langName(opts.lang)}. ${JSON_RULE} Schema: {"questions":[{"type":"multipleChoice","prompt":"","options":["","","",""],"answer":""}]}`,
    user: `Write ${opts.count} questions from:\n\n${truncate(source, MAX_INPUT)}`,
    schema: practiceTestSchema,
    maxTokens: Math.min(4000, 100 + opts.count * 120),
    temperature: 0.4,
  }
}

export function podcastPrompt(title: string, cards: readonly Pick<Card, 'term' | 'definition'>[], lang: string): Prompt {
  const list = cards.map((c, i) => `${i}. ${plainText(c.term)} — ${plainText(c.definition)}`).join('\n')
  return {
    system: `You write a short, friendly spoken script (like a mini podcast host) that teaches flashcards. Keep sentences short and speakable. Structure: an "intro" segment, then for each card a "term" segment (ask the listener to recall it, include the term) followed by a "definition" segment (explain it in one or two sentences), occasionally a "line" segment linking topics, then a "recap" and an "outro". Set "cardIndex" to the card number on term/definition segments. Write in ${langName(lang)}. ${JSON_RULE} Schema: {"segments":[{"kind":"intro","text":""},{"kind":"term","text":"","cardIndex":0}]}`,
    user: `Set title: ${title}\nCards:\n${list}`,
    schema: scriptSchema,
    maxTokens: Math.min(4000, 200 + cards.length * 90),
    temperature: 0.6,
  }
}

export function tutorSystemPrompt(setTitle: string, cards: readonly Pick<Card, 'term' | 'definition'>[], lang: string): string {
  const list = cards.slice(0, 80).map((c) => `- ${plainText(c.term)}: ${plainText(c.definition)}`).join('\n')
  return `You are a patient study tutor inside a flashcard app. The student studies the set "${setTitle}". Use ONLY the cards below as source of truth; if asked something outside the set, say so briefly. Keep answers short (max 120 words), use plain text or light markdown. When quizzing ("stump me"), ask one question at a time and wait for the answer; then grade it and give the correct answer. Write in ${langName(lang)}.\n\nCards:\n${list}`
}
