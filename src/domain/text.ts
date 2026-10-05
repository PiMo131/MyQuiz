/** Text helpers shared by grading, search and import. */

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Remove markdown/HTML markup for plain comparison or TTS. */
export function plainText(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\{\{c\d+::([^:}]+)(::[^}]*)?\}\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalize(
  s: string,
  opts: { caseSensitive?: boolean; ignoreAccents?: boolean; ignoreParentheses?: boolean } = {},
): string {
  let t = plainText(s)
  if (opts.ignoreParentheses !== false) t = t.replace(/\([^)]*\)/g, '')
  if (!opts.caseSensitive) t = t.toLowerCase()
  if (opts.ignoreAccents !== false) t = stripAccents(t)
  t = t.replace(/[.,;:!?'"“”‘’`´]/g, '')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function sample<T>(arr: readonly T[], n: number, rng?: () => number): T[] {
  return shuffle(arr, rng).slice(0, n)
}

/** Deterministic PRNG for reproducible tests/games. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
