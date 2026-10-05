import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { getCards } from '@/db/repo'
import type { Card, Progress, StudySet } from '@/domain/types'

export interface SetData {
  set: StudySet | undefined
  cards: Card[]
  /** All progress rows of the set (every variant). */
  progress: Progress[]
  loading: boolean
  missing: boolean
}

/** Live set + cards + progress for a set id. */
export function useSetData(setId: string | undefined): SetData {
  const set = useLiveQuery(async () => (setId ? db.sets.get(setId) : undefined), [setId])
  const cards = useLiveQuery(async () => (setId ? getCards(setId) : ([] as Card[])), [setId])
  const progress = useLiveQuery(async () => (setId ? db.progress.where('setId').equals(setId).toArray() : ([] as Progress[])), [setId])
  const loading = set === undefined && cards === undefined
  return { set, cards: cards ?? [], progress: progress ?? [], loading, missing: !loading && set === undefined && cards !== undefined }
}

/** Progress keyed by `${cardId}:${variant}`. */
export function progressMap(rows: Progress[]): Map<string, Progress> {
  return new Map(rows.map((p) => [p.id, p]))
}
