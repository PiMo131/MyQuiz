import type { Card } from '@/domain/types'
export function pickDistractors(card: Card, pool: Card[], n = 3): string[] {
  return pool.filter((c) => c.id !== card.id && c.definition !== card.definition).slice(0, n).map((c) => c.definition)
}
