import { describe, expect, it } from 'vitest'
import type { Card, Progress } from '@/domain/types'
import { applyRating, makeScheduler } from '@/domain/srs'
import { afterRating, allProgress, buildPlan, createSession, faces, stateLabel, variantsFor } from './session'

const cards: Card[] = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, setId: 's', position: i, term: `t${i}`, definition: `d${i}`, starred: false, suspended: false, createdAt: 0, updatedAt: 0 }))
const cloze: Card = { ...cards[0], id: 'cz', cloze: 'A {{c1::b}} and {{c2::c}}', term: '', definition: '' }
const now = Date.UTC(2026, 9, 5, 10)

describe('srs session', () => {
  it('derives variants from set card types and cloze', () => {
    expect(variantsFor(cards[0], { cardTypes: ['basic'] })).toEqual(['forward'])
    expect(variantsFor(cards[0], { cardTypes: ['basic', 'reverse'] })).toEqual(['forward', 'reverse'])
    expect(variantsFor(cloze, { cardTypes: ['basic'] })).toEqual(['cloze:1', 'cloze:2'])
  })

  it('creates in-memory new progress rows for missing ones', () => {
    const rows = allProgress(cards, { cardTypes: ['basic'] }, [], now)
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.bucket === 'new')).toBe(true)
  })

  it('builds a plan with due and new cards and respects newPerDay', () => {
    const f = makeScheduler({ enableFuzz: false })
    const reviewed: Progress = { ...allProgress([cards[0]], { cardTypes: ['basic'] }, [], now - 86400000 * 10)[0] }
    const out = applyRating(f, reviewed.fsrs, 3, now - 86400000 * 10)
    reviewed.fsrs = out.fsrs
    const plan = buildPlan(cards, { cardTypes: ['basic'] }, [reviewed], { newPerDay: 2 }, now)
    expect(plan.due.map((i) => i.card.id)).toEqual(['c0'])
    expect(plan.fresh).toHaveLength(2)
  })

  it('re-queues again-rated cards within the session and tracks counts', () => {
    const f = makeScheduler({ enableFuzz: false })
    const plan = buildPlan(cards, { cardTypes: ['basic'] }, [], {}, now)
    let s = createSession(plan, now)
    expect(s.total).toBe(5)
    const cur = s.queue[0]
    const again = applyRating(f, cur.progress.fsrs, 1, now)
    s = afterRating(s, { ...cur.progress, fsrs: again.fsrs }, 1, now)
    expect(s.finished).toBe(0)
    expect(s.queue).toHaveLength(5)
    expect(s.queue[2].card.id).toBe('c0')
    expect(s.counts[1]).toBe(1)
    const easy = applyRating(f, s.queue[0].progress.fsrs, 4, now)
    s = afterRating(s, { ...s.queue[0].progress, fsrs: easy.fsrs }, 4, now)
    expect(s.finished).toBe(1)
    expect(s.nextDue).toBe(easy.fsrs.due)
  })

  it('labels state and renders faces per variant', () => {
    const p = allProgress([cards[0]], { cardTypes: ['basic'] }, [], now)[0]
    expect(stateLabel(p)).toBe('new')
    expect(faces(cards[0], 'reverse')).toMatchObject({ front: 'd0', back: 't0' })
    expect(faces(cloze, 'cloze:1')).toMatchObject({ front: 'A [...] and c', back: 'A b and c' })
  })
})
