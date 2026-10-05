import { distance } from 'fastest-levenshtein'
import type { GradingOptions } from './types'
import { DEFAULT_GRADING } from './types'
import { normalize, plainText } from './text'

export interface GradeResult {
  correct: boolean
  /** 0..1 similarity to the best matching expected answer */
  similarity: number
  matched: string // the expected answer that matched best (plain)
  given: string
}

function splitAlternatives(expected: string): string[] {
  const base = plainText(expected)
  const parts = base
    .split(/\s*(?:\/|;|\|)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 1 ? [base, ...parts] : [base]
}

function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1
  const d = distance(a, b)
  return 1 - d / Math.max(a.length, b.length, 1)
}

function allowedEdits(len: number, strictness: GradingOptions['strictness']): number {
  if (strictness === 'strict') return 0
  if (strictness === 'moderate') return len <= 4 ? 1 : len <= 9 ? 2 : Math.floor(len / 5) + 1
  // relaxed
  return len <= 4 ? 1 : Math.ceil(len / 4) + 1
}

/** Compare a typed answer against one or more accepted answers. */
export function gradeAnswer(
  given: string,
  expected: string | string[],
  options: Partial<GradingOptions> = {},
): GradeResult {
  const opts: GradingOptions = { ...DEFAULT_GRADING, ...options }
  const candidatesRaw = Array.isArray(expected) ? expected : [expected]
  const candidates = opts.acceptAlternatives !== false ? candidatesRaw.flatMap(splitAlternatives) : candidatesRaw.map(plainText)

  const normOpts = {
    caseSensitive: opts.strictness === 'strict' ? false : opts.caseSensitive,
    ignoreAccents: opts.strictness === 'strict' ? false : opts.ignoreAccents,
    ignoreParentheses: opts.ignoreParentheses,
  }
  const g = normalize(given, normOpts)

  let best: GradeResult = { correct: false, similarity: 0, matched: candidates[0] ?? '', given: plainText(given) }
  for (const c of candidates) {
    const n = normalize(c, normOpts)
    const sim = similarity(g, n)
    let correct = g === n
    if (!correct && opts.strictness !== 'strict') {
      correct = distance(g, n) <= allowedEdits(n.length, opts.strictness)
    }
    if (!correct && opts.strictness === 'relaxed') {
      // token-set overlap: accept if all significant tokens of expected appear in given
      const ex = n.split(' ').filter((t) => t.length > 2)
      const gv = new Set(g.split(' '))
      if (ex.length > 0 && ex.every((t) => gv.has(t))) correct = true
    }
    if (correct || sim > best.similarity) best = { correct, similarity: sim, matched: c, given: plainText(given) }
    if (correct) break
  }
  return best
}

export interface DiffPart {
  text: string
  type: 'same' | 'missing' | 'extra'
}

/** Character-level diff for "you said / correct answer" display (LCS based, small strings). */
export function diffAnswer(given: string, expected: string): { given: DiffPart[]; expected: DiffPart[] } {
  const a = plainText(given)
  const b = plainText(expected)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i].toLowerCase() === b[j].toLowerCase() ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ga: DiffPart[] = []
  const gb: DiffPart[] = []
  const push = (arr: DiffPart[], ch: string, type: DiffPart['type']) => {
    const last = arr[arr.length - 1]
    if (last && last.type === type) last.text += ch
    else arr.push({ text: ch, type })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i].toLowerCase() === b[j].toLowerCase()) {
      push(ga, a[i], 'same')
      push(gb, b[j], 'same')
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(ga, a[i], 'extra')
      i++
    } else {
      push(gb, b[j], 'missing')
      j++
    }
  }
  while (i < n) push(ga, a[i++], 'extra')
  while (j < m) push(gb, b[j++], 'missing')
  return { given: ga, expected: gb }
}
