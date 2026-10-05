/** Pure helpers for the import page: find a share code in pasted text and decode both wire formats. */
import type { LangPair, SharedSet } from '@/domain/types'
import { decodeSet, decodeShared, isShareCode } from '@/domain/share-codec'
import type { ParsedCard } from '@/domain/import-export/parsers'

export interface Decoded {
  title: string
  description: string
  lang: LangPair
  tags: string[]
  cards: ParsedCard[]
  externalId?: string
  shared?: SharedSet
  sourceLabel: string
}

export function extractCode(input: string): string | undefined {
  const s = input.trim()
  if (!s) return undefined
  if (isShareCode(s)) return s
  const m = /[?&]d=([12]\.[A-Za-z0-9_-]+)/.exec(s) || /#\/embed\/([12]\.[A-Za-z0-9_-]+)/.exec(s)
  if (m) return decodeURIComponent(m[1])
  return undefined
}

export function decodeCode(code: string): Decoded {
  if (code.startsWith('2.')) {
    const shared = decodeShared(code)
    return {
      title: shared.set.title,
      description: shared.set.description,
      lang: shared.set.lang,
      tags: shared.set.tags ?? [],
      cards: shared.cards.map((c) => ({ term: c.term, definition: c.definition, hint: c.hint, cloze: c.cloze ?? undefined, externalId: c.id })),
      externalId: shared.set.externalId ?? shared.set.id,
      shared,
      sourceLabel: 'link',
    }
  }
  const d = decodeSet(code)
  return { title: d.title, description: d.description, lang: d.lang, tags: [], cards: d.cards, externalId: d.externalId, sourceLabel: 'link' }
}

