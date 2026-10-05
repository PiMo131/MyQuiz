import type { Card } from '@/domain/types'
export function explainTemplate(card: Card, _given: string, _lang: string): string {
  return `${card.term} → ${card.definition}`
}
