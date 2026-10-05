import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/domain/text'
import { allGroups, clearCells, createCharmBoard, findGroup, groupScore, hasValidGroup, reshuffleBoard, type CharmBoard } from './charms'

function boardFrom(rows: string[]): CharmBoard {
  let id = 1
  return rows.map((row) => [...row].map((ch) => ({ id: id++, type: Number(ch) })))
}

describe('charms engine', () => {
  it('creates a 9x6 board with a valid group', () => {
    const b = createCharmBoard({ rng: mulberry32(1), nextId: 1 })
    expect(b).toHaveLength(9)
    expect(b[0]).toHaveLength(6)
    expect(hasValidGroup(b)).toBe(true)
    const ids = new Set(b.flat().map((c) => c.id))
    expect(ids.size).toBe(54)
  })
  it('finds orthogonally connected groups only', () => {
    const b = boardFrom(['0011', '0101', '2211'])
    expect(findGroup(b, 0, 0).sort()).toEqual([[0, 0], [0, 1], [1, 0]].sort())
    expect(findGroup(b, 1, 1)).toEqual([[1, 1]]) // diagonal does not connect
    expect(findGroup(b, 0, 2).length).toBe(5)
    expect(findGroup(b, 2, 0).length).toBe(2)
  })
  it('scores n^2 * 10', () => {
    expect(groupScore(2)).toBe(40)
    expect(groupScore(5)).toBe(250)
  })
  it('applies gravity and spawns new charms on top', () => {
    const b = boardFrom(['012', '345', '112'])
    const ctx = { rng: mulberry32(2), nextId: 100 }
    const res = clearCells(b, [[2, 0], [2, 1]], ctx)
    expect(res.removed.map((c) => c.type)).toEqual([1, 1])
    expect(res.spawned).toBe(2)
    // column 0: old (1,0)=3 falls to row 2, (0,0)=0 falls to row 1, new on row 0
    expect(res.board[2][0].type).toBe(3)
    expect(res.board[1][0].type).toBe(0)
    expect(res.board[0][0].id).toBeGreaterThanOrEqual(100)
    // column 2 untouched
    expect(res.board.map((r) => r[2].type)).toEqual([2, 5, 2])
    expect(res.board.flat()).toHaveLength(9)
  })
  it('reports bonus moves from numbered charms', () => {
    const b = boardFrom(['00', '11'])
    b[0][0].bonus = 4
    const res = clearCells(b, [[0, 0], [0, 1]], { rng: mulberry32(3), nextId: 50 })
    expect(res.bonusMoves).toBe(4)
  })
  it('detects boards without groups and reshuffles deterministically', () => {
    const b = boardFrom(['0101', '1010', '0101'])
    expect(hasValidGroup(b)).toBe(false)
    expect(allGroups(b)).toEqual([])
    const r1 = reshuffleBoard(b, mulberry32(9))
    const r2 = reshuffleBoard(b, mulberry32(9))
    expect(r1.flat().map((c) => c.id)).toEqual(r2.flat().map((c) => c.id))
    expect(new Set(r1.flat().map((c) => c.id)).size).toBe(12)
  })
})
