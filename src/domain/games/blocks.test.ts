import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/domain/text'
import { anyFits, canPlace, clearLines, emptyGrid, fitsAnywhere, placeShape, randomTray, rotateCells, scorePlacement, SHAPES, shapeBounds } from './blocks'

const byId = (id: string) => SHAPES.find((s) => s.id === id)!

describe('blocks engine', () => {
  it('has the required base shapes with rotations', () => {
    for (const id of ['i1', 'i2', 'i3', 'i4', 'i5', 'o2', 'o3', 'l5', 'j5', 't4', 's4', 'z4', 'c3', 'p5']) expect(byId(id)).toBeDefined()
    expect(SHAPES.filter((s) => s.id.startsWith('i2')).length).toBe(2)
    expect(SHAPES.filter((s) => s.id.startsWith('l5')).length).toBe(4)
    expect(SHAPES.filter((s) => s.id.startsWith('o2')).length).toBe(1)
    expect(SHAPES.filter((s) => s.id.startsWith('p5')).length).toBe(1)
  })
  it('rotates cells', () => {
    expect(rotateCells([[0, 0], [0, 1], [0, 2]])).toEqual([[0, 0], [1, 0], [2, 0]])
    expect(shapeBounds(byId('i4r1'))).toEqual({ rows: 4, cols: 1 })
  })
  it('validates placement bounds and overlaps', () => {
    const g = emptyGrid()
    expect(canPlace(g, byId('i4'), 0, 0)).toBe(true)
    expect(canPlace(g, byId('i4'), 0, 5)).toBe(false)
    expect(canPlace(g, byId('o3'), 6, 6)).toBe(false)
    expect(canPlace(g, byId('i1'), -1, 0)).toBe(false)
    const { grid } = placeShape(g, byId('o2'), 0, 0)
    expect(canPlace(grid, byId('i1'), 1, 1)).toBe(false)
    expect(canPlace(grid, byId('i1'), 2, 2)).toBe(true)
  })
  it('scores one point per cell when nothing clears', () => {
    const res = placeShape(emptyGrid(), byId('t4'), 2, 2)
    expect(res.points).toBe(4)
    expect(res.clearedRows).toEqual([])
    expect(res.grid[2][2]).toBe(byId('t4').color + 1)
  })
  it('clears a full row and awards line points', () => {
    let g = emptyGrid()
    g = placeShape(g, byId('i4'), 7, 0).grid
    const res = placeShape(g, byId('i4'), 7, 4)
    expect(res.clearedRows).toEqual([7])
    expect(res.grid[7].every((v) => v === 0)).toBe(true)
    expect(res.points).toBe(scorePlacement(4, 1, 0))
    expect(res.points).toBe(14)
  })
  it('clears a column and a row at once with multi-line bonus', () => {
    let g = emptyGrid()
    // fill column 0 rows 0..6 and row 7 cols 1..7, then place i1 at (7,0)
    for (let r = 0; r < 7; r++) g = placeShape(g, byId('i1'), r, 0).grid
    for (let c = 1; c < 8; c++) g = placeShape(g, byId('i1'), 7, c).grid
    const res = placeShape(g, byId('i1'), 7, 0)
    expect(res.clearedRows).toEqual([7])
    expect(res.clearedCols).toEqual([0])
    expect(res.clearedCells).toHaveLength(15)
    expect(res.points).toBe(1 + 20 + 10)
    expect(res.grid.flat().every((v) => v === 0)).toBe(true)
  })
  it('adds combo bonus only when lines clear', () => {
    expect(scorePlacement(3, 0, 4)).toBe(3)
    expect(scorePlacement(3, 1, 2)).toBe(3 + 10 + 10)
  })
  it('detects game over when no piece fits', () => {
    const g = emptyGrid()
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 0) g[r][c] = 1
    expect(fitsAnywhere(g, byId('i1'))).toBe(true)
    expect(fitsAnywhere(g, byId('i2'))).toBe(false)
    expect(anyFits(g, [byId('i2'), byId('o2'), byId('l5')])).toBe(false)
    expect(anyFits(g, [byId('i2'), byId('i1')])).toBe(true)
  })
  it('clearLines leaves a grid with no full lines', () => {
    const g = emptyGrid()
    g[3].fill(2)
    const res = clearLines(g)
    expect(res.rows).toEqual([3])
    expect(res.grid[3].every((v) => v === 0)).toBe(true)
  })
  it('generates a deterministic tray', () => {
    const a = randomTray(mulberry32(42), 3).map((s) => s.id)
    const b = randomTray(mulberry32(42), 3).map((s) => s.id)
    expect(a).toEqual(b)
    expect(a).toHaveLength(3)
  })
})
