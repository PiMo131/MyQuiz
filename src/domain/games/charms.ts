/** Charms engine: tap groups of >=2 same-type adjacent charms, gravity, spawn, numbered bonus charms. */

export const CHARM_TYPES = 6
export const CHARM_COLS = 6
export const CHARM_ROWS = 9
export const CHARM_START_MOVES = 10
export const CHARM_DEFAULT_BONUS = 3

export interface Charm {
  id: number
  type: number
  /** numbered special charm: clearing it asks a question worth this many moves */
  bonus?: number
}

/** board[row][col], row 0 = top */
export type CharmBoard = Charm[][]

export interface CharmRng {
  rng: () => number
  nextId: number
}

function spawnCharm(ctx: CharmRng, specialChance: number): Charm {
  const type = Math.floor(ctx.rng() * CHARM_TYPES)
  const c: Charm = { id: ctx.nextId++, type }
  if (ctx.rng() < specialChance) c.bonus = 3 + Math.floor(ctx.rng() * 3) // 3..5
  return c
}

export function createCharmBoard(ctx: CharmRng, rows = CHARM_ROWS, cols = CHARM_COLS, specialChance = 0.08): CharmBoard {
  let board: CharmBoard = []
  for (let attempt = 0; attempt < 20; attempt++) {
    board = Array.from({ length: rows }, () => Array.from({ length: cols }, () => spawnCharm(ctx, specialChance)))
    if (hasValidGroup(board)) return board
  }
  return board
}

export function findGroup(board: CharmBoard, row: number, col: number): Array<[number, number]> {
  const rows = board.length
  const cols = board[0]?.length ?? 0
  if (row < 0 || col < 0 || row >= rows || col >= cols) return []
  const type = board[row][col].type
  const seen = new Set<string>()
  const out: Array<[number, number]> = []
  const stack: Array<[number, number]> = [[row, col]]
  while (stack.length) {
    const [r, c] = stack.pop() as [number, number]
    const key = `${r},${c}`
    if (seen.has(key)) continue
    if (r < 0 || c < 0 || r >= rows || c >= cols) continue
    if (board[r][c].type !== type) continue
    seen.add(key)
    out.push([r, c])
    stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1])
  }
  return out
}

export function hasValidGroup(board: CharmBoard): boolean {
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board[r].length; c++) {
      const t = board[r][c].type
      if ((r + 1 < board.length && board[r + 1][c].type === t) || (c + 1 < board[r].length && board[r][c + 1].type === t)) return true
    }
  return false
}

export function groupScore(n: number): number {
  return n * n * 10
}

export interface ClearResult {
  board: CharmBoard
  removed: Charm[]
  /** sum of bonus values on removed numbered charms (0 if none) */
  bonusMoves: number
  spawned: number
}

/** Remove the given cells, let charms above fall, spawn new ones at the top. */
export function clearCells(board: CharmBoard, cells: Array<[number, number]>, ctx: CharmRng, specialChance = 0.08): ClearResult {
  const rows = board.length
  const cols = board[0]?.length ?? 0
  const remove = new Set(cells.map(([r, c]) => `${r},${c}`))
  const removed: Charm[] = []
  let bonusMoves = 0
  const next: CharmBoard = Array.from({ length: rows }, () => new Array<Charm>(cols))
  let spawned = 0
  for (let c = 0; c < cols; c++) {
    const column: Charm[] = []
    for (let r = rows - 1; r >= 0; r--) {
      const ch = board[r][c]
      if (remove.has(`${r},${c}`)) {
        removed.push(ch)
        if (ch.bonus) bonusMoves += ch.bonus
      } else column.push(ch)
    }
    // column[0] is bottom-most surviving charm
    for (let r = rows - 1, i = 0; r >= 0; r--, i++) {
      if (i < column.length) next[r][c] = column[i]
      else {
        next[r][c] = spawnCharm(ctx, specialChance)
        spawned++
      }
    }
  }
  return { board: next, removed, bonusMoves, spawned }
}

/** Shuffle the existing charms into new positions (keeps ids/types). */
export function reshuffleBoard(board: CharmBoard, rng: () => number): CharmBoard {
  const flat = board.flat()
  for (let i = flat.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[flat[i], flat[j]] = [flat[j], flat[i]]
  }
  const cols = board[0]?.length ?? 0
  return board.map((row, r) => row.map((_, c) => flat[r * cols + c]))
}

/** All groups of size >= 2 (for hints / "no moves" detection). */
export function allGroups(board: CharmBoard): Array<Array<[number, number]>> {
  const seen = new Set<string>()
  const groups: Array<Array<[number, number]>> = []
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board[r].length; c++) {
      if (seen.has(`${r},${c}`)) continue
      const g = findGroup(board, r, c)
      for (const [gr, gc] of g) seen.add(`${gr},${gc}`)
      if (g.length >= 2) groups.push(g)
    }
  return groups
}
