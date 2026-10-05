/**
 * Spaced-repetition session helpers (pure). Builds the list of card variants to review from the
 * daily plan and handles in-session re-queueing of cards that are still in learning.
 */
import type { Card, Progress, Rating, SrsParams, StudySet, Variant } from '@/domain/types'
import { clozeIndices, renderCloze } from '@/domain/cloze'
import { dailyPlan, emptyFsrsState, progressId } from '@/domain/srs'

/** All variants a card is studied in for this set. */
export function variantsFor(card: Card, set: Pick<StudySet, 'cardTypes'>): Variant[] {
  if (card.cloze && clozeIndices(card.cloze).length) return clozeIndices(card.cloze).map((n) => `cloze:${n}` as Variant)
  const out: Variant[] = ['forward']
  if (set.cardTypes.includes('reverse')) out.push('reverse')
  return out
}

/** Progress rows for every variant; missing rows become in-memory "new" rows. */
export function allProgress(cards: Card[], set: Pick<StudySet, 'cardTypes'>, existing: Progress[], now = Date.now()): Progress[] {
  const map = new Map(existing.map((p) => [p.id, p]))
  const out: Progress[] = []
  for (const card of cards) {
    if (card.suspended) continue
    for (const v of variantsFor(card, set)) {
      const id = progressId(card.id, v)
      out.push(
        map.get(id) ?? {
          id,
          cardId: card.id,
          setId: card.setId,
          variant: v,
          fsrs: emptyFsrsState(now),
          bucket: 'new',
          correct: 0,
          incorrect: 0,
          updatedAt: now,
        },
      )
    }
  }
  return out
}

export interface SrsItem {
  progress: Progress
  card: Card
}

export interface SrsPlan {
  due: SrsItem[];
  fresh: SrsItem[]
}

export function buildPlan(cards: Card[], set: Pick<StudySet, 'cardTypes'>, existing: Progress[], params: Partial<SrsParams>, now = Date.now()): SrsPlan {
  const byId = new Map(cards.map((c) => [c.id, c]))
  const plan = dailyPlan(allProgress(cards, set, existing, now), params, now)
  const toItems = (rows: Progress[]) => rows.flatMap((p) => (byId.get(p.cardId) ? [{ progress: p, card: byId.get(p.cardId)! }] : []))
  return { due: toItems(plan.due), fresh: toItems(plan.fresh) }
}

export interface SrsSession {
  queue: SrsItem[]
  finished: number
  total: number
  counts: Record<Rating, number>
  /** Earliest next due among reviewed cards (ms). */
  nextDue: number | null
  startedAt: number
}

export function createSession(plan: SrsPlan, now = Date.now()): SrsSession {
  const queue = [...plan.due, ...plan.fresh]
  return { queue, finished: 0, total: queue.length, counts: { 1: 0, 2: 0, 3: 0, 4: 0 }, nextDue: null, startedAt: now }
}

/** Learning-step cards (due again within this window) come back later in the session. */
export const REQUEUE_WINDOW_MS = 20 * 60 * 1000

export function afterRating(session: SrsSession, updated: Progress, rating: Rating, now = Date.now()): SrsSession {
  const [cur, ...rest] = session.queue
  if (!cur) return session
  const counts = { ...session.counts, [rating]: session.counts[rating] + 1 }
  const again = updated.fsrs.due - now < REQUEUE_WINDOW_MS && updated.fsrs.state !== 2
  const item: SrsItem = { progress: updated, card: cur.card }
  if (again) {
    const at = Math.min(rest.length, rating === 1 ? 2 : 4)
    const queue = [...rest.slice(0, at), item, ...rest.slice(at)]
    return { ...session, queue, counts }
  }
  const nextDue = session.nextDue === null ? updated.fsrs.due : Math.min(session.nextDue, updated.fsrs.due)
  return { ...session, queue: rest, finished: session.finished + 1, counts, nextDue }
}

export type StateLabel = 'new' | 'learning' | 'review'

export function stateLabel(p: Progress): StateLabel {
  if (p.fsrs.state === 0) return 'new'
  if (p.fsrs.state === 2) return 'review'
  return 'learning'
}

/** Prompt/answer text for a card in a given variant. */
export function faces(card: Card, variant: Variant): { front: string; back: string; frontImage?: string; backImage?: string } {
  if (variant.startsWith('cloze:') && card.cloze) {
    const n = Number(variant.slice(6))
    const r = renderCloze(card.cloze, n)
    return { front: r.question, back: r.full }
  }
  if (variant === 'reverse') return { front: card.definition, back: card.term, frontImage: card.image?.definition, backImage: card.image?.term }
  return { front: card.term, back: card.definition, frontImage: card.image?.term, backImage: card.image?.definition }
}
