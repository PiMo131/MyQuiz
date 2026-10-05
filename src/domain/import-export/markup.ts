/**
 * Conversions between the card markdown subset (**b**, *i*, __u__, ==y:x==) and HTML (Anki, Quizlet exports).
 * Pure string functions; no DOM required.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+\d*);/gi, (m, code: string) => {
    const lower = code.toLowerCase()
    if (lower in ENTITIES) return ENTITIES[lower]
    if (lower.startsWith('#x')) {
      const n = parseInt(lower.slice(2), 16)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    if (lower.startsWith('#')) {
      const n = parseInt(lower.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return m
  })
}

export function encodeEntities(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface HtmlToMarkdownResult {
  text: string
  /** `src` attributes of images that were removed from the text. */
  images: string[]
  /** `src` attributes of `[sound:...]` references (Anki) or <audio> tags. */
  audio: string[]
}

/** Convert simple HTML (Anki/Quizlet) to the card markdown subset. Unknown tags are stripped. */
export function htmlToMarkdown(html: string): HtmlToMarkdownResult {
  const images: string[] = []
  const audio: string[] = []
  let s = html
  // Anki sound references
  s = s.replace(/\[sound:([^\]]+)\]/g, (_, src: string) => {
    audio.push(src)
    return ''
  })
  s = s.replace(/<img[^>]*\bsrc=["']?([^"'\s>]+)["']?[^>]*>/gi, (_, src: string) => {
    images.push(src)
    return ''
  })
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
  s = s.replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
  s = s.replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
  s = s.replace(/<u\b[^>]*>([\s\S]*?)<\/u>/gi, '__$1__')
  s = s.replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, '==$1==')
  s = s.replace(/<(sub|sup|code)\b[^>]*>([\s\S]*?)<\/\1>/gi, '<$1>$2</$1>') // allowed by Markdown.tsx
  s = s.replace(/<(?!\/?(?:sub|sup|code)\b)[^>]+>/g, '')
  s = decodeEntities(s)
  s = s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim()
  return { text: s, images, audio }
}

/** Convert the card markdown subset to HTML for Anki/Quizlet exports. */
export function markdownToHtml(md: string): string {
  let s = encodeEntities(md)
  s = s.replace(/==(?:(y|b|p):)?([^=\n]+)==/g, '<mark>$2</mark>')
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  s = s.replace(/__([^_\n]+)__/g, '<u>$1</u>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
  s = s.replace(/\n/g, '<br>')
  return s
}

/** True when the string looks like it contains HTML tags. */
export function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(s)
}
