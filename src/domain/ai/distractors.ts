/**
 * Distractor heuristics for multiple-choice questions.
 * Prefers answers from the same set with a similar "shape" (numeric vs text, similar length),
 * and perturbs numbers when the pool is too small.
 */
import type { Card } from '@/domain/types'
import { plainText } from '@/domain/text'
import { dedupeKey } from './textUtil'

const NUM_RE = /^-?\d+([.,]\d+)?\s*(%|[a-zA-Z°]{0,6})?$/

function isNumeric(s: string): boolean {
  return NUM_RE.test(s.trim())
}

function shape(s: string): 'number' | 'short' | 'phrase' | 'sentence' {
  if (isNumeric(s)) return 'number'
  const w = s.trim().split(/\s+/).length
  if (w <= 2) return 'short'
  if (w <= 7) return 'phrase'
  return 'sentence'
}

function lengthScore(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  return 1 - Math.abs(la - lb) / Math.max(la, lb, 1)
}

/** Perturb a numeric answer into `n` plausible wrong numbers. */
export function perturbNumber(answer: string, n: number, rng: () => number = Math.random): string[] {
  const m = /^(-?\d+)(?:([.,])(\d+))?(.*)$/.exec(answer.trim())
  if (!m) return []
  const intPart = m[1]
  const sep = m[2] ?? ''
  const frac = m[3] ?? ''
  const suffix = m[4] ?? ''
  const value = Number(`${intPart}${sep ? '.' + frac : ''}`)
  const decimals = frac.length
  const out = new Set<string>()
  const candidates: number[] = []
  const mag = Math.max(1, Math.pow(10, Math.max(0, String(Math.abs(Math.trunc(value))).length - 1)))
  candidates.push(value + 1, value - 1, value + 10, value - 10, value * 2, value / 2, value + mag, value - mag, value * 1.1, value * 0.9)
  // digit swap
  if (intPart.length >= 2) {
    const d = intPart.replace('-', '').split('')
    const i = Math.floor(rng() * (d.length - 1))
    ;[d[i], d[i + 1]] = [d[i + 1], d[i]]
    const swapped = Number((intPart.startsWith('-') ? '-' : '') + d.join(''))
    if (swapped !== value) candidates.push(swapped)
  }
  const fmt = (v: number) => {
    const fixed = decimals ? v.toFixed(decimals) : String(Math.round(v))
    return (sep === ',' ? fixed.replace('.', ',') : fixed) + suffix
  }
  // shuffle candidates deterministically with rng
  const shuffled = candidates.slice().sort(() => rng() - 0.5)
  for (const c of shuffled) {
    if (!Number.isFinite(c) || c === value) continue
    if (value >= 0 && c < 0) continue
    const s = fmt(c)
    if (s === answer.trim()) continue
    out.add(s)
    if (out.size >= n) break
  }
  return [...out]
}

/** Choose `n` wrong answers for `answer` from `candidates` (strings), best-matching shape first. */
export function pickDistractorsFor(answer: string, candidates: readonly string[], n = 3, rng: () => number = Math.random): string[] {
  const target = plainText(answer)
  const key = dedupeKey(target)
  const sh = shape(target)
  const seen = new Set<string>([key])
  const scored: { s: string; score: number }[] = []
  for (const raw of candidates) {
    const c = plainText(raw)
    const k = dedupeKey(c)
    if (!k || seen.has(k)) continue
    seen.add(k)
    let score = lengthScore(target, c)
    if (shape(c) === sh) score += 1
    // same first word is a nice confusable
    if (c.split(' ')[0]?.toLowerCase() === target.split(' ')[0]?.toLowerCase() && c.length > 3) score += 0.3
    score += rng() * 0.25 // a bit of variety
    scored.push({ s: c, score })
  }
  scored.sort((a, b) => b.score - a.score)
  const out = scored.slice(0, n).map((x) => x.s)
  if (out.length < n && sh === 'number') {
    for (const p of perturbNumber(target, n - out.length, rng)) {
      if (!seen.has(dedupeKey(p))) {
        out.push(p)
        seen.add(dedupeKey(p))
      }
    }
  }
  return out.slice(0, n)
}

export interface DistractorOptions {
  /** Which side is being asked for: 'definition' (default) or 'term'. */
  side?: 'term' | 'definition'
  rng?: () => number
}

/** Pick distractors for a card from the rest of its set. User-supplied `card.distractors` win. */
export function pickDistractors(card: Card, pool: readonly Card[], n = 3, opts: DistractorOptions = {}): string[] {
  const side = opts.side ?? 'definition'
  const answer = side === 'definition' ? card.definition : card.term
  const user = side === 'definition' ? (card.distractors ?? []).filter(Boolean) : []
  if (user.length >= n) return user.slice(0, n)
  const candidates = pool.filter((c) => c.id !== card.id).map((c) => (side === 'definition' ? c.definition : c.term))
  const picked = pickDistractorsFor(answer, [...user, ...candidates], n, opts.rng)
  return picked
}
