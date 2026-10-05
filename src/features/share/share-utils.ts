/** Pure helpers for the import page: find a share code in pasted text and decode both wire formats. */
import type { LangPair, SharedSet } from '@/domain/types'
import { extractShareCode } from '@/domain/share-codec'
import { parseShareCode, type ParseResult, type ParsedCard } from '@/domain/import-export/parsers'

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
  return extractShareCode(input)
}

/** Shape any parser result for the import preview. `fallbackTitle` is used when the source has no title. */
export function fromParseResult(r: ParseResult, fallbackTitle = ''): Decoded {
  return {
    title: r.title ?? fallbackTitle,
    description: r.description ?? '',
    lang: r.lang ?? { term: '', definition: '' },
    tags: r.tags ?? [],
    cards: r.cards,
    externalId: r.externalId,
    shared: r.shared,
    sourceLabel: r.source,
  }
}

export function decodeCode(code: string): Decoded {
  return fromParseResult(parseShareCode(code))
}

/** Map an error thrown by `parseChatbotOutput` to its `share` i18n key. */
export function parseErrorKey(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  if (msg === 'invalidJson') return 'import.errJson'
  if (msg === 'badCode') return 'import.errDecode'
  return 'import.errNoCards'
}
