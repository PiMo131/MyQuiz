import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/domain/text'
import { anyEscaped, blastPoints, hitAsteroid, levelState, makeBlastRound, spawnAsteroids, stepAsteroids, streakMultiplier } from './blast'

const cards = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, term: `term ${i}`, definition: `def ${i}` }))

describe('blast engine', () => {
  it('makes rounds with 3..5 options and exactly one correct', () => {
    const r1 = makeBlastRound(cards, cards[2], mulberry32(1), 'definition', 1)
    expect(r1.options).toHaveLength(3)
    expect(r1.options.filter((o) => o === r1.correct)).toHaveLength(1)
    expect(r1.correct).toBe('term 2')
    expect(r1.prompt).toBe('def 2')
    const r3 = makeBlastRound(cards, cards[2], mulberry32(1), 'definition', 5)
    expect(r3.options).toHaveLength(5)
  })
  it('multiplier grows with streak and caps', () => {
    expect(streakMultiplier(0)).toBe(1)
    expect(streakMultiplier(3)).toBe(2)
    expect(streakMultiplier(100)).toBe(4)
    expect(blastPoints(6)).toBe(30)
  })
  it('computes level progress', () => {
    expect(levelState(0)).toEqual({ level: 1, into: 0, goal: 50 })
    expect(levelState(50)).toEqual({ level: 2, into: 0, goal: 100 })
    expect(levelState(170)).toEqual({ level: 3, into: 20, goal: 150 })
  })
  it('spawns asteroids inside the width and moves them down', () => {
    const list = spawnAsteroids(['a', 'b', 'c', 'd'], 'c', 800, mulberry32(3), 1)
    expect(list).toHaveLength(4)
    expect(list.filter((a) => a.correct)).toHaveLength(1)
    for (const a of list) {
      expect(a.x - a.r).toBeGreaterThanOrEqual(-1)
      expect(a.x + a.r).toBeLessThanOrEqual(801)
      expect(a.y).toBeLessThan(0)
    }
    const before = list.map((a) => a.y)
    stepAsteroids(list, 1, 800)
    list.forEach((a, i) => expect(a.y).toBeGreaterThan(before[i]))
    expect(anyEscaped(list, 600)).toBe(false)
    stepAsteroids(list, 100, 800)
    expect(anyEscaped(list, 600)).toBe(true)
    for (const a of list) {
      expect(a.x - a.r).toBeGreaterThanOrEqual(0)
      expect(a.x + a.r).toBeLessThanOrEqual(800)
    }
  })
  it('hit-tests the top-most asteroid', () => {
    const list = spawnAsteroids(['a', 'b'], 'a', 400, mulberry32(2), 1)
    const t = list[1]
    expect(hitAsteroid(list, t.x, t.y)?.id).toBe(t.id)
    expect(hitAsteroid(list, -500, -500)).toBeUndefined()
    t.alive = false
    expect(hitAsteroid(list, t.x, t.y)?.id).not.toBe(t.id)
  })
})
