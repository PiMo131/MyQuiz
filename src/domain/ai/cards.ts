/**
 * Heuristic flashcard extraction from free text (no LLM needed).
 * Recognises "X: Y", "X — Y", "X - Y", tab/semicolon separated lines, bullet pairs,
 * Q/A lines, bold-term lines, heading + paragraph, and definition sentences ("X is Y").
 */
import { capitalize, dedupeKey, headingText, isHeadingLine, splitSentences, stripBullet, stripTrailingPunct } from './textUtil'
import { isStopword } from './lang'

export interface ExtractedCard {
  term: string
  definition: string
  hint?: string
  /** Anki-style cloze text ({{c1::answer}}) when the 'cloze' style is applied. */
  cloze?: string
  /** Which heuristic produced the card (for debugging/tests). */
  source?: 'separator' | 'qa' | 'bold' | 'heading' | 'sentence' | 'bulletPair' | 'csv'
}

export interface ExtractOptions {
  max?: number
  /** Minimum definition length (chars). */
  minDefinition?: number
}

export type CardStyle = 'termDefinition' | 'qa' | 'cloze'

const MAX_TERM = 90
const MAX_DEF = 400

const SEP_RE = /^(.{1,90}?)\s*(?:\t|\s[—–]\s|\s-\s|\s=\s|\s→\s|\s->\s|(?<!https?):\s)\s*(.+)$/u
const BOLD_RE = /^\*\*([^*]{1,90})\*\*\s*[:—–-]?\s*(.+)$/
const Q_RE = /^(?:q|question|vraag|v)\s*[:.)]\s*(.+)$/i
const A_RE = /^(?:a|answer|antwoord)\s*[:.)]\s*(.+)$/i
const SENTENCE_RE =
  /^(?:(?:de|het|een|the|a|an)\s+)?([\p{Lu}][\p{L}\p{N}'’\- ]{1,60}?)\s+(is een|is a|is an|is de|is het|is the|is|zijn|are|betekent|means|refers to|verwijst naar|wordt gedefinieerd als|is defined as|noemen we|is called|heet)\s+(.{3,})$/u

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function okTerm(t: string): boolean {
  return t.length >= 1 && t.length <= MAX_TERM && /\p{L}|\p{N}/u.test(t)
}

function okDef(d: string, min: number): boolean {
  return d.length >= min && d.length <= MAX_DEF && /\p{L}|\p{N}/u.test(d)
}

/** Parse "Q: … / A: …" pairs and "…?\n answer" pairs. */
function extractQa(lines: string[], push: (c: ExtractedCard) => void): Set<number> {
  const used = new Set<number>()
  for (let i = 0; i < lines.length - 1; i++) {
    const q = Q_RE.exec(stripBullet(lines[i]))
    if (q) {
      // find next answer line
      for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
        const a = A_RE.exec(stripBullet(lines[j]))
        if (a) {
          push({ term: clean(q[1]), definition: clean(a[1]), source: 'qa' })
          used.add(i)
          used.add(j)
          i = j
          break
        }
      }
      continue
    }
    const l = stripBullet(lines[i])
    const next = stripBullet(lines[i + 1] ?? '')
    if (l.endsWith('?') && next && !next.endsWith('?') && !SEP_RE.test(next) && next.length <= MAX_DEF) {
      push({ term: clean(l), definition: clean(next), source: 'qa' })
      used.add(i)
      used.add(i + 1)
      i++
    }
  }
  return used
}

/** Detect a consistent CSV-ish delimiter (tab or ;) across most non-empty lines. */
function csvDelimiter(lines: string[]): '\t' | ';' | null {
  const nonEmpty = lines.filter((l) => l.trim())
  if (nonEmpty.length < 2) return null
  for (const d of ['\t', ';'] as const) {
    const ok = nonEmpty.filter((l) => l.split(d).length >= 2).length
    if (ok / nonEmpty.length >= 0.8) return d
  }
  return null
}

export function extractCards(text: string, opts: ExtractOptions = {}): ExtractedCard[] {
  const max = opts.max ?? 60
  const minDef = opts.minDefinition ?? 2
  const out: ExtractedCard[] = []
  const seen = new Set<string>()
  const push = (c: ExtractedCard) => {
    const term = stripTrailingPunct(clean(c.term)).replace(/^\*\*|\*\*$/g, '')
    const definition = clean(c.definition)
    if (!okTerm(term) || !okDef(definition, minDef)) return
    if (dedupeKey(term) === dedupeKey(definition)) return
    const key = dedupeKey(term)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({ ...c, term, definition })
  }

  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  // 1. CSV / TSV
  const delim = csvDelimiter(lines)
  if (delim) {
    for (const raw of lines) {
      const cols = raw.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''))
      if (cols.length >= 2 && cols[0] && cols[1]) push({ term: cols[0], definition: cols[1], hint: cols[2] || undefined, source: 'csv' })
    }
    if (out.length >= 2) return out.slice(0, max)
  }

  // 2. Q/A pairs
  const used = extractQa(lines, push)

  // 3. Line-based patterns
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue
    const raw = lines[i]
    const line = stripBullet(raw)
    if (!line) continue

    const bold = BOLD_RE.exec(line)
    if (bold) {
      push({ term: bold[1], definition: bold[2], source: 'bold' })
      continue
    }

    const sep = SEP_RE.exec(line)
    if (sep && !/^https?:/i.test(line)) {
      const term = sep[1]
      const def = sep[2]
      // avoid times like 12:30 and tiny fragments
      if (!/^\d{1,2}$/.test(term.trim()) && term.trim().split(/\s+/).length <= 10) {
        push({ term, definition: def, source: 'separator' })
        continue
      }
    }

    // bullet pair: "- term" followed by an indented "  - definition"
    const isBullet = /^\s*(?:[-*•]|\d+[.)])\s+/.test(raw)
    const nextRaw = lines[i + 1] ?? ''
    const indentCur = raw.match(/^\s*/)![0].length
    const indentNext = nextRaw.match(/^\s*/)![0].length
    if (isBullet && /^\s*(?:[-*•])\s+/.test(nextRaw) && indentNext > indentCur && line.split(/\s+/).length <= 8) {
      const def = stripBullet(nextRaw)
      if (def && !SEP_RE.test(def)) {
        push({ term: line, definition: def, source: 'bulletPair' })
        used.add(i + 1)
        i++
        continue
      }
    }

    // heading followed by a paragraph
    if (isHeadingLine(raw) && !isBullet) {
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j++
      const para = lines[j]?.trim()
      if (para && !isHeadingLine(lines[j]) && !SEP_RE.test(stripBullet(para)) && !/^[-*•]/.test(para)) {
        const first = splitSentences(para)[0] ?? para
        push({ term: headingText(raw), definition: first, source: 'heading' })
        continue
      }
    }
  }

  // 4. Definition sentences in prose
  if (out.length < max) {
    const prose = lines.filter((_, i) => !used.has(i)).join('\n')
    for (const s of splitSentences(prose.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, ''))) {
      const m = SENTENCE_RE.exec(s)
      if (!m) continue
      const subject = clean(m[1])
      const words = subject.split(' ')
      if (words.length > 5) continue
      if (words.every((w) => isStopword(w))) continue
      if (/^(dit|dat|deze|die|this|that|these|those|it|er|there|here|hier)$/i.test(subject)) continue
      const verb = m[2]
      const predicate = stripTrailingPunct(clean(m[3]))
      const keepVerb = /^(is een|is a|is an|is de|is het|is the)$/.test(verb)
      const def = keepVerb ? `${verb.split(' ').slice(1).join(' ')} ${predicate}` : predicate
      push({ term: subject, definition: capitalize(def.trim()), source: 'sentence' })
      if (out.length >= max) break
    }
  }

  return out.slice(0, max)
}

/** Convert extracted cards to the requested style. */
export function applyCardStyle(cards: ExtractedCard[], style: CardStyle, lang: string): ExtractedCard[] {
  if (style === 'termDefinition') return cards
  const nl = lang.startsWith('nl')
  if (style === 'qa') {
    return cards.map((c) => {
      if (/\?$/.test(c.term)) return c
      const q = nl ? `Wat is ${c.term}?` : `What is ${c.term}?`
      return { ...c, term: q }
    })
  }
  // cloze: blank the term inside the definition when possible, otherwise "definition → {{c1::term}}"
  return cards.map((c) => {
    const re = new RegExp(escapeRe(c.term), 'i')
    const cloze = re.test(c.definition) ? c.definition.replace(re, `{{c1::${c.term}}}`) : `${c.definition} → {{c1::${c.term}}}`
    return { ...c, cloze }
  })
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
