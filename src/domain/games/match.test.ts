import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/domain/text'
import { createMatch, formatTenths, isMatchComplete, MATCH_PENALTY_MS, selectTile } from './match'

const cards = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, term: `term ${i}`, definition: `def ${i}` }))

describe('match engine', () => {
  it('creates 12 tiles from 6 pairs, each card once per side', () => {
    const s = createMatch(cards, mulberry32(1))
    expect(s.tiles).toHaveLength(12)
    expect(s.pairs).toBe(6)
    const ids = new Set(s.tiles.map((t) => t.cardId))
    expect(ids.size).toBe(6)
    for (const id of ids) {
      expect(s.tiles.filter((t) => t.cardId === id && t.side === 'term')).toHaveLength(1)
      expect(s.tiles.filter((t) => t.cardId === id && t.side === 'definition')).toHaveLength(1)
    }
  })
  it('is deterministic for the same seed', () => {
    expect(createMatch(cards, mulberry32(7)).tiles.map((t) => t.id)).toEqual(createMatch(cards, mulberry32(7)).tiles.map((t) => t.id))
  })
  it('matches a term with its definition and completes', () => {
    let s = createMatch(cards, mulberry32(3))
    const first = s.tiles[0]
    const partner = s.tiles.find((t) => t.cardId === first.cardId && t.id !== first.id)!
    s = selectTile(s, first.id)
    expect(s.selected).toBe(first.id)
    expect(s.lastEvent).toBe('select')
    s = selectTile(s, partner.id)
    expect(s.lastEvent).toBe('correct')
    expect(s.matched).toEqual([first.id, partner.id])
    expect(s.selected).toBeNull()
    // matched tiles ignore further clicks
    expect(selectTile(s, first.id).lastEvent).toBe('ignored')
    // finish the rest
    for (const t of s.tiles) {
      if (s.matched.includes(t.id)) continue
      const p = s.tiles.find((o) => o.cardId === t.cardId && o.id !== t.id)!
      s = selectTile(selectTile(s, t.id), p.id)
    }
    expect(isMatchComplete(s)).toBe(true)
    expect(s.penaltyMs).toBe(0)
  })
  it('adds a penalty on a wrong pair and deselects on re-click', () => {
    let s = createMatch(cards, mulberry32(5))
    const a = s.tiles[0]
    const b = s.tiles.find((t) => t.cardId !== a.cardId)!
    s = selectTile(selectTile(s, a.id), b.id)
    expect(s.lastEvent).toBe('wrong')
    expect(s.wrong).toBe(1)
    expect(s.penaltyMs).toBe(MATCH_PENALTY_MS)
    expect(s.selected).toBeNull()
    s = selectTile(s, a.id)
    s = selectTile(s, a.id)
    expect(s.lastEvent).toBe('deselect')
    expect(s.selected).toBeNull()
  })
  it('does not match two tiles of the same side', () => {
    let s = createMatch(cards, mulberry32(9))
    const a = s.tiles.find((t) => t.side === 'term')!
    const b = s.tiles.find((t) => t.side === 'term' && t.id !== a.id)!
    s = selectTile(selectTile(s, a.id), b.id)
    expect(s.lastEvent).toBe('wrong')
  })
  it('uses fewer pairs when the set is small', () => {
    const s = createMatch(cards.slice(0, 3), mulberry32(1))
    expect(s.pairs).toBe(3)
    expect(s.tiles).toHaveLength(6)
  })
  it('formats tenths', () => {
    expect(formatTenths(12340)).toBe('12.3')
    expect(formatTenths(0)).toBe('0.0')
  })
})
