import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/domain/text'
import { generateWordSearch, lineCells, matchSelection, placementCells, prepareWord, snapToLine } from './wordsearch'

const words = ['appel', 'banaan', 'citroen', 'druif', 'kers', 'mango', 'peer', 'pruim', 'vijg', 'kiwi', 'meloen', 'aardbei'].map((w, i) => ({ id: `w${i}`, text: w }))

describe('wordsearch engine', () => {
  it('prepares words: strips accents and non-letters, enforces length', () => {
    expect(prepareWord('café au lait')).toBe('CAFEAULAIT')
    expect(prepareWord('**bold**')).toBe('BOLD')
    expect(prepareWord('ab')).toBe('')
    expect(prepareWord('abcdefghijklm')).toBe('')
    expect(prepareWord('1234')).toBe('')
  })
  it('generates a filled grid where every placement reads correctly', () => {
    const ws = generateWordSearch(words, 12, mulberry32(11))
    expect(ws.grid).toHaveLength(12)
    expect(ws.placements.length).toBeGreaterThanOrEqual(8)
    expect(ws.placements.length).toBeLessThanOrEqual(10)
    for (const row of ws.grid) for (const ch of row) expect(ch).toMatch(/^[A-Z]$/)
    for (const p of ws.placements) {
      const cells = placementCells(p)
      expect(cells.map(([r, c]) => ws.grid[r][c]).join('')).toBe(p.word)
      for (const [r, c] of cells) {
        expect(r).toBeGreaterThanOrEqual(0)
        expect(c).toBeGreaterThanOrEqual(0)
        expect(r).toBeLessThan(12)
        expect(c).toBeLessThan(12)
      }
    }
  })
  it('is deterministic', () => {
    const a = generateWordSearch(words, 10, mulberry32(5))
    const b = generateWordSearch(words, 10, mulberry32(5))
    expect(a.grid).toEqual(b.grid)
    expect(a.placements).toEqual(b.placements)
  })
  it('skips words that do not fit a small grid instead of failing', () => {
    const ws = generateWordSearch(words, 6, mulberry32(2))
    expect(ws.placements.every((p) => p.word.length <= 6)).toBe(true)
    expect(ws.placements.length + ws.skipped.length).toBeLessThanOrEqual(10)
  })
  it('matches a drag selection in either direction', () => {
    const ws = generateWordSearch(words, 12, mulberry32(11))
    const p = ws.placements[0]
    const cells = placementCells(p)
    const a = cells[0]
    const b = cells[cells.length - 1]
    expect(matchSelection(ws, a, b)?.id).toBe(p.id)
    expect(matchSelection(ws, b, a)?.id).toBe(p.id)
    // a partial selection does not match
    if (cells.length > 2) expect(matchSelection(ws, a, cells[cells.length - 2])?.id).not.toBe(p.id)
  })
  it('lineCells rejects non-straight lines', () => {
    expect(lineCells([0, 0], [2, 1])).toBeNull()
    expect(lineCells([0, 0], [2, 2])).toEqual([[0, 0], [1, 1], [2, 2]])
    expect(lineCells([3, 3], [3, 0])).toHaveLength(4)
  })
  it('snaps near-diagonal drags to a direction', () => {
    expect(snapToLine([0, 0], [3, 2])).toEqual([3, 3])
    expect(snapToLine([0, 0], [5, 1])).toEqual([5, 0])
    expect(snapToLine([0, 0], [0, 4])).toEqual([0, 4])
  })
})
