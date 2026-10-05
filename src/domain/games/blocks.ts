/** Blocks engine: place polyomino pieces on an 8x8 grid, clear full rows/columns. */

export const BLOCKS_GRID = 8
export const LINE_POINTS = 10

export type Cell = readonly [row: number, col: number]

export interface Shape {
  /** base shape id, e.g. 'l5' */
  id: string
  cells: Cell[]
  /** colour index 0..n for the UI */
  color: number
}

/** Grid value: 0 = empty, otherwise colour index + 1. */
export type Grid = number[][]

const base: Array<{ id: string; cells: Cell[]; color: number }> = [
  { id: 'i1', color: 0, cells: [[0, 0]] },
  { id: 'i2', color: 1, cells: [[0, 0], [0, 1]] },
  { id: 'i3', color: 2, cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'i4', color: 3, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: 'i5', color: 4, cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id: 'o2', color: 5, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { id: 'o3', color: 6, cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]] },
  { id: 'l5', color: 7, cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
  { id: 'j5', color: 8, cells: [[0, 2], [1, 2], [2, 2], [2, 1], [2, 0]] },
  { id: 't4', color: 9, cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: 's4', color: 10, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { id: 'z4', color: 11, cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { id: 'c3', color: 12, cells: [[0, 0], [1, 0], [1, 1]] },
  { id: 'p5', color: 13, cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
]

function normalizeCells(cells: Cell[]): Cell[] {
  const minR = Math.min(...cells.map((c) => c[0]))
  const minC = Math.min(...cells.map((c) => c[1]))
  return cells.map(([r, c]) => [r - minR, c - minC] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

export function rotateCells(cells: Cell[]): Cell[] {
  const maxR = Math.max(...cells.map((c) => c[0]))
  return normalizeCells(cells.map(([r, c]) => [c, maxR - r] as const))
}

function uniqueRotations(cells: Cell[]): Cell[][] {
  const out: Cell[][] = []
  const seen = new Set<string>()
  let cur = normalizeCells(cells)
  for (let i = 0; i < 4; i++) {
    const key = JSON.stringify(cur)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(cur)
    }
    cur = rotateCells(cur)
  }
  return out
}

/** All shapes including rotations (for the piece generator). */
export const SHAPES: Shape[] = base.flatMap((b) => uniqueRotations(b.cells).map((cells, i) => ({ id: `${b.id}${i ? `r${i}` : ''}`, cells, color: b.color })))

export const SHAPE_COLORS = 14

export function emptyGrid(size = BLOCKS_GRID): Grid {
  return Array.from({ length: size }, () => new Array<number>(size).fill(0))
}

export function shapeBounds(shape: Shape): { rows: number; cols: number } {
  return { rows: Math.max(...shape.cells.map((c) => c[0])) + 1, cols: Math.max(...shape.cells.map((c) => c[1])) + 1 }
}

export function canPlace(grid: Grid, shape: Shape, row: number, col: number): boolean {
  const n = grid.length
  for (const [r, c] of shape.cells) {
    const rr = row + r
    const cc = col + c
    if (rr < 0 || cc < 0 || rr >= n || cc >= n) return false
    if (grid[rr][cc] !== 0) return false
  }
  return true
}

export interface PlaceResult {
  grid: Grid
  placedCells: number
  clearedRows: number[]
  clearedCols: number[]
  /** cells cleared (for animation) */
  clearedCells: Cell[]
  points: number
}

export function clearLines(grid: Grid): { grid: Grid; rows: number[]; cols: number[]; cells: Cell[] } {
  const n = grid.length
  const rows: number[] = []
  const cols: number[] = []
  for (let r = 0; r < n; r++) if (grid[r].every((v) => v !== 0)) rows.push(r)
  for (let c = 0; c < n; c++) if (grid.every((row) => row[c] !== 0)) cols.push(c)
  if (!rows.length && !cols.length) return { grid, rows, cols, cells: [] }
  const next = grid.map((row) => row.slice())
  const cells: Cell[] = []
  for (const r of rows) for (let c = 0; c < n; c++) { cells.push([r, c]); next[r][c] = 0 }
  for (const c of cols) for (let r = 0; r < n; r++) { if (!rows.includes(r)) cells.push([r, c]); next[r][c] = 0 }
  return { grid: next, rows, cols, cells }
}

/** Points for a placement: 1 per cell, 10 per line, extra for multi-line and combos. */
export function scorePlacement(placedCells: number, lines: number, combo: number): number {
  const linePts = lines * LINE_POINTS
  const multi = lines > 1 ? (lines - 1) * LINE_POINTS : 0
  const comboPts = lines > 0 ? combo * 5 : 0
  return placedCells + linePts + multi + comboPts
}

/** Place a shape (caller must check canPlace). `combo` = consecutive previous placements that cleared lines. */
export function placeShape(grid: Grid, shape: Shape, row: number, col: number, combo = 0): PlaceResult {
  const next = grid.map((r) => r.slice())
  for (const [r, c] of shape.cells) next[row + r][col + c] = shape.color + 1
  const cleared = clearLines(next)
  const lines = cleared.rows.length + cleared.cols.length
  return {
    grid: cleared.grid,
    placedCells: shape.cells.length,
    clearedRows: cleared.rows,
    clearedCols: cleared.cols,
    clearedCells: cleared.cells,
    points: scorePlacement(shape.cells.length, lines, combo),
  }
}

export function fitsAnywhere(grid: Grid, shape: Shape): boolean {
  const n = grid.length
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (canPlace(grid, shape, r, c)) return true
  return false
}

export function anyFits(grid: Grid, shapes: readonly Shape[]): boolean {
  return shapes.some((s) => fitsAnywhere(grid, s))
}

/** Random tray of `n` pieces. Favours smaller pieces slightly so games last. */
export function randomTray(rng: () => number, n = 3): Shape[] {
  const out: Shape[] = []
  for (let i = 0; i < n; i++) out.push(SHAPES[Math.floor(rng() * SHAPES.length)])
  return out
}

/** Cells a shape would occupy at (row, col) — for hover previews. */
export function footprint(shape: Shape, row: number, col: number): Cell[] {
  return shape.cells.map(([r, c]) => [row + r, col + c] as const)
}

export function filledCount(grid: Grid): number {
  return grid.reduce((a, row) => a + row.filter((v) => v !== 0).length, 0)
}
