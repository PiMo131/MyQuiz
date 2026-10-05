/** Word search generator + selection validation. */
import { stripAccents } from '@/domain/text'
import { plainText, shuffle } from '@/domain/text'

export const WS_MAX_WORDS = 10
export const WS_MAX_LEN = 12
export const WS_MIN_LEN = 3

export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

export interface WordInput {
  id: string
  text: string
}

export interface Placement {
  id: string
  word: string
  row: number
  col: number
  dr: number
  dc: number
}

export interface WordSearch {
  size: number
  grid: string[][]
  placements: Placement[]
  /** ids of words that could not be placed */
  skipped: string[]
}

/** Letters only (A-Z, diacritics stripped). Returns '' when the word is unusable. */
export function prepareWord(raw: string, maxLen = WS_MAX_LEN): string {
  const w = stripAccents(plainText(raw)).toUpperCase().replace(/[^A-Z]/g, '')
  if (w.length < WS_MIN_LEN || w.length > maxLen) return ''
  return w
}

export function placementCells(p: Placement): Array<[number, number]> {
  return [...p.word].map((_, i) => [p.row + p.dr * i, p.col + p.dc * i])
}

function tryPlace(grid: string[][], word: string, rng: () => number, tries: number): Placement | null {
  const size = grid.length
  for (let t = 0; t < tries; t++) {
    const [dr, dc] = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)]
    const row = Math.floor(rng() * size)
    const col = Math.floor(rng() * size)
    const endR = row + dr * (word.length - 1)
    const endC = col + dc * (word.length - 1)
    if (endR < 0 || endC < 0 || endR >= size || endC >= size) continue
    let ok = true
    for (let i = 0; i < word.length; i++) {
      const cur = grid[row + dr * i][col + dc * i]
      if (cur !== '' && cur !== word[i]) { ok = false; break }
    }
    if (!ok) continue
    return { id: '', word, row, col, dr, dc }
  }
  return null
}

const FILL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Generate a word search. Retries with different seeds-in-sequence; falls back to fewer words.
 * Longer words are placed first.
 */
export function generateWordSearch(words: readonly WordInput[], size: number, rng: () => number, maxWords = WS_MAX_WORDS): WordSearch {
  const prepared = words
    .map((w) => ({ id: w.id, word: prepareWord(w.text, Math.min(WS_MAX_LEN, size)) }))
    .filter((w) => w.word.length > 0)
  // dedupe identical words
  const seen = new Set<string>()
  const unique = prepared.filter((w) => (seen.has(w.word) ? false : (seen.add(w.word), true)))
  const chosen = shuffle(unique, rng).slice(0, maxWords).sort((a, b) => b.word.length - a.word.length)

  let best: WordSearch | null = null
  for (let attempt = 0; attempt < 12; attempt++) {
    const grid: string[][] = Array.from({ length: size }, () => new Array<string>(size).fill(''))
    const placements: Placement[] = []
    const skipped: string[] = []
    for (const w of chosen) {
      const p = tryPlace(grid, w.word, rng, 200)
      if (!p) { skipped.push(w.id); continue }
      p.id = w.id
      for (let i = 0; i < w.word.length; i++) grid[p.row + p.dr * i][p.col + p.dc * i] = w.word[i]
      placements.push(p)
    }
    const ws: WordSearch = { size, grid, placements, skipped }
    if (!best || placements.length > best.placements.length) best = ws
    if (skipped.length === 0) break
  }
  const out = best as WordSearch
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (out.grid[r][c] === '') out.grid[r][c] = FILL[Math.floor(rng() * FILL.length)]
  return out
}

/** Cells on a straight line (8 directions) from a to b inclusive, or null if not aligned. */
export function lineCells(a: [number, number], b: [number, number]): Array<[number, number]> | null {
  const dr = b[0] - a[0]
  const dc = b[1] - a[1]
  if (dr === 0 && dc === 0) return [a]
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null
  const n = Math.max(Math.abs(dr), Math.abs(dc))
  const sr = Math.sign(dr)
  const sc = Math.sign(dc)
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + sr * i, a[1] + sc * i])
}

/** Find the placement matching a selection from a to b (either direction). */
export function matchSelection(ws: WordSearch, a: [number, number], b: [number, number]): Placement | undefined {
  const cells = lineCells(a, b)
  if (!cells) return undefined
  const fwd = cells.map(([r, c]) => ws.grid[r]?.[c] ?? '').join('')
  const rev = [...fwd].reverse().join('')
  return ws.placements.find((p) => {
    if (p.word !== fwd && p.word !== rev) return false
    const pc = placementCells(p)
    const first = pc[0]
    const last = pc[pc.length - 1]
    return (first[0] === a[0] && first[1] === a[1] && last[0] === b[0] && last[1] === b[1]) || (first[0] === b[0] && first[1] === b[1] && last[0] === a[0] && last[1] === a[1])
  })
}

/** Snap an arbitrary drag end to the nearest of the 8 directions from `a`, keeping the length. */
export function snapToLine(a: [number, number], b: [number, number]): [number, number] {
  const dr = b[0] - a[0]
  const dc = b[1] - a[1]
  if (dr === 0 || dc === 0) return b
  const adr = Math.abs(dr)
  const adc = Math.abs(dc)
  if (Math.abs(adr - adc) <= Math.max(adr, adc) * 0.5) {
    const n = Math.max(adr, adc)
    return [a[0] + Math.sign(dr) * n, a[1] + Math.sign(dc) * n]
  }
  return adr > adc ? [b[0], a[1]] : [a[0], b[1]]
}
