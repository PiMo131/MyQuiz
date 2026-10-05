import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Folder, StudySet } from '@/domain/types'
import { bucketCounts, masteryPercent, type BucketCounts } from '@/domain/achievements'

export interface SetMeta {
  cards: number
  buckets: BucketCounts
  mastery: number
}

/** Card counts + mastery per set, live. */
export function useSetMeta(): Map<string, SetMeta> | undefined {
  const cardSetIds = useLiveQuery(() => db.cards.orderBy('setId').keys() as Promise<string[]>, [])
  const progress = useLiveQuery(() => db.progress.where('variant').equals('forward').toArray(), [])
  return useMemo(() => {
    if (!cardSetIds || !progress) return undefined
    const counts = new Map<string, number>()
    for (const id of cardSetIds) counts.set(id, (counts.get(id) ?? 0) + 1)
    const bySet = new Map<string, typeof progress>()
    for (const p of progress) {
      const arr = bySet.get(p.setId) ?? []
      arr.push(p)
      bySet.set(p.setId, arr)
    }
    const out = new Map<string, SetMeta>()
    const ids = new Set([...counts.keys(), ...bySet.keys()])
    for (const id of ids) {
      const cards = counts.get(id) ?? 0
      const buckets = bucketCounts(bySet.get(id) ?? [], cards)
      out.set(id, { cards, buckets, mastery: masteryPercent(buckets) })
    }
    return out
  }, [cardSetIds, progress])
}

export function useSets(): StudySet[] | undefined {
  return useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().toArray(), [])
}

export function useFolders(): Folder[] | undefined {
  return useLiveQuery(() => db.folders.orderBy('name').toArray(), [])
}

export function useFolderMap(): Map<string, Folder> {
  const folders = useFolders()
  return useMemo(() => new Map((folders ?? []).map((f) => [f.id, f])), [folders])
}

export const FOLDER_COLORS = ['#6366f1', '#06b6da', '#10b881', '#f59e0b', '#ec4899', '#ef4444', '#8b5cf6', '#64748b']

export function matchesQuery(set: StudySet, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return set.title.toLowerCase().includes(needle) || set.description.toLowerCase().includes(needle) || set.tags.some((t) => t.toLowerCase().includes(needle))
}
