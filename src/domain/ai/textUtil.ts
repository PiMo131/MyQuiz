/** Small text utilities shared by the AI heuristics. */
import { normalize } from '@/domain/text'

/** Split prose into sentences. Keeps abbreviations like "e.g." and decimals mostly intact. */
export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []
  const parts = cleaned
    .replace(/(\b(?:e\.g|i\.e|bv|bijv|etc|dr|mr|mrs|ca|nr|vs|o\.a|d\.w\.z)\.)\s/gi, '$1\uE000')
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÝÄÖÜ0-9"“(])/)
    .map((s) => s.replace(/\uE000/g, ' ').trim())
    .filter((s) => s.length > 1)
  return parts
}

/** Split into paragraphs (blank-line separated). */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0
}

/** Case/accents/markup-insensitive key for deduplication. */
export function dedupeKey(s: string): string {
  return normalize(s)
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•▪●◦‣]|\d+[.)]|[a-z][.)]|[ivx]+[.)])\s+/i, '').trim()
}

export function stripTrailingPunct(s: string): string {
  return s.replace(/[.;,:]+$/, '').trim()
}

export function isHeadingLine(line: string): boolean {
  const l = line.trim()
  if (!l) return false
  if (/^#{1,6}\s+/.test(l)) return true
  if (/^(?:hoofdstuk|chapter|deel|part|les|lesson|paragraaf|section)\s+\d+/i.test(l)) return true
  // Short line, no sentence punctuation, starts with capital, mostly words, not a bullet
  if (l.length <= 60 && !/[.!?,;:]$/.test(l) && /^[A-ZÀ-Ý0-9]/.test(l) && wordCount(l) <= 8 && !/^[-*•]/.test(l) && !/[:—–]\s/.test(l)) {
    // Must be followed/preceded by something; the caller decides using context. Treat ALL CAPS or Title Case as heading.
    const words = l.split(/\s+/)
    const titled = words.filter((w) => /^[A-ZÀ-Ý]/.test(w) || /^\d/.test(w)).length
    return l === l.toUpperCase() || titled / words.length >= 0.6
  }
  return false
}

export function headingText(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').replace(/:$/, '').trim()
}
