/**
 * Heuristic study guide: outline from headings, key terms (bold / capitalised / repeated nouns /
 * extracted definitions), summary from first sentences, and practice questions.
 */
import { extractCards, type ExtractedCard } from './cards'
import { isStopword } from './lang'
import { capitalize, dedupeKey, headingText, isHeadingLine, splitParagraphs, splitSentences, stripBullet, wordCount } from './textUtil'

export interface OutlineSection {
  heading: string
  points: string[]
}
export interface KeyTerm {
  term: string
  definition?: string
}
export interface GuideQuestion {
  question: string
  answer: string
}
export interface StudyGuide {
  title: string
  outline: OutlineSection[]
  keyTerms: KeyTerm[]
  summary: string[]
  questions: GuideQuestion[]
  cards: ExtractedCard[]
}

export interface StudyGuideOptions {
  lang?: string
  maxKeyTerms?: number
  maxSummary?: number
  maxQuestions?: number
}

function firstSentence(p: string): string {
  const s = splitSentences(p)[0] ?? p
  return s.length > 220 ? s.slice(0, 217).trimEnd() + '…' : s
}

/** Group lines into sections by headings. Bullets and sentences under a heading become points. */
export function buildOutline(text: string, fallbackTitle: string): OutlineSection[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const sections: OutlineSection[] = []
  let cur: OutlineSection | null = null
  let para: string[] = []
  const flush = () => {
    if (!para.length) return
    const p = para.join(' ').trim()
    para = []
    if (!p) return
    if (!cur) cur = { heading: fallbackTitle, points: [] }
    if (cur.points.length < 8) cur.points.push(firstSentence(p))
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    if (isHeadingLine(raw) && !/^\s*[-*•]/.test(raw)) {
      flush()
      if (cur) sections.push(cur)
      cur = { heading: headingText(line), points: [] }
      continue
    }
    if (/^\s*(?:[-*•]|\d+[.)])\s+/.test(raw)) {
      flush()
      if (!cur) cur = { heading: fallbackTitle, points: [] }
      const b = stripBullet(raw)
      if (b && cur.points.length < 8) cur.points.push(b.length > 160 ? b.slice(0, 157) + '…' : b)
      continue
    }
    para.push(line)
  }
  flush()
  if (cur) sections.push(cur)
  return sections.filter((s) => s.points.length > 0 || sections.length > 1)
}

/** Key terms: extracted definitions, **bold** phrases, mid-sentence capitalised words, repeated long words. */
export function extractKeyTerms(text: string, max = 20): KeyTerm[] {
  const out: KeyTerm[] = []
  const seen = new Set<string>()
  const add = (term: string, definition?: string) => {
    const t = term.trim().replace(/[.,;:]+$/, '')
    const k = dedupeKey(t)
    if (!k || seen.has(k) || t.length < 2 || t.length > 60) return
    seen.add(k)
    out.push(definition ? { term: t, definition } : { term: t })
  }
  for (const c of extractCards(text, { max })) add(c.term, c.definition)
  for (const m of text.matchAll(/\*\*([^*\n]{2,60})\*\*/g)) add(m[1])
  // capitalised words not at sentence start (proper nouns / concepts)
  const sentences = splitSentences(text)
  const cleanWord = (w: string) => w.replace(/[^\p{L}\p{N}-]/gu, '')
  for (const s of sentences) {
    const words = s.split(/\s+/)
    for (let i = 1; i < words.length; i++) {
      const w = cleanWord(words[i])
      if (w.length >= 4 && /^\p{Lu}\p{Ll}+/u.test(w) && !isStopword(w)) add(w)
      if (out.length >= max) return out
    }
  }
  // sentence-initial proper nouns / long concepts (lower priority)
  for (const s of sentences) {
    const w = cleanWord(s.split(/\s+/)[0] ?? '')
    if (w.length >= 7 && /^\p{Lu}\p{Ll}+$/u.test(w) && !isStopword(w)) add(w)
    if (out.length >= max) return out
  }
  // repeated long words
  const freq = new Map<string, number>()
  for (const w of text.toLowerCase().match(/\p{L}{6,}/gu) ?? []) {
    if (isStopword(w)) continue
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  const repeated = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
  for (const [w] of repeated) {
    if (out.length >= max) break
    add(capitalize(w))
  }
  return out.slice(0, max)
}

export function buildSummary(text: string, max = 5): string[] {
  const paras = splitParagraphs(text).filter((p) => !isHeadingLine(p) && wordCount(p) >= 6 && !/^\s*[-*•]/.test(p))
  const sents = paras.map(firstSentence)
  if (sents.length >= 2) return sents.slice(0, max)
  // fallback: first sentences of the whole text
  return splitSentences(text).slice(0, max)
}

export function buildQuestions(keyTerms: KeyTerm[], text: string, lang: string, max = 8): GuideQuestion[] {
  const nl = lang.startsWith('nl')
  const qs: GuideQuestion[] = []
  for (const k of keyTerms) {
    if (qs.length >= max) break
    if (k.definition) qs.push({ question: nl ? `Wat is ${k.term}?` : `What is ${k.term}?`, answer: k.definition })
  }
  if (qs.length < max) {
    const sents = splitSentences(text)
    for (const k of keyTerms) {
      if (qs.length >= max) break
      if (k.definition) continue
      const s = sents.find((x) => x.toLowerCase().includes(k.term.toLowerCase()) && wordCount(x) <= 30)
      if (s) qs.push({ question: s.replace(new RegExp(escapeRe(k.term), 'i'), '_____'), answer: k.term })
    }
  }
  return qs
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildStudyGuide(text: string, opts: StudyGuideOptions = {}): StudyGuide {
  const lang = opts.lang ?? 'nl'
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  const title = isHeadingLine(firstLine) ? headingText(firstLine) : firstLine.split(/[.!?]/)[0].slice(0, 60) || (lang.startsWith('nl') ? 'Studiegids' : 'Study guide')
  const outline = buildOutline(text, title)
  const keyTerms = extractKeyTerms(text, opts.maxKeyTerms ?? 20)
  const summary = buildSummary(text, opts.maxSummary ?? 5)
  const questions = buildQuestions(keyTerms, text, lang, opts.maxQuestions ?? 8)
  const cards = extractCards(text, { max: 60 })
  return { title, outline, keyTerms, summary, questions, cards }
}
