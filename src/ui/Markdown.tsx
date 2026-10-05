import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { cn } from './cn'

marked.use({
  breaks: true,
  gfm: true,
  extensions: [
    {
      name: 'highlight',
      level: 'inline',
      start(src: string) {
        return src.indexOf('==')
      },
      tokenizer(src: string) {
        const m = /^==(?:(y|b|p):)?([^=]+)==/.exec(src)
        if (m) return { type: 'highlight', raw: m[0], color: m[1] ?? 'y', text: m[2] }
        return undefined
      },
      renderer(token) {
        const t = token as unknown as { color: string; text: string }
        const cls = t.color === 'b' ? 'hl-blue' : t.color === 'p' ? 'hl-pink' : 'hl-yellow'
        return `<mark class="${cls}">${t.text}</mark>`
      },
    },
  ],
})

// Links in cards/AI output always open in a new tab without opener access; only http(s)/mailto are kept.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A') return
  const href = node.getAttribute('href') ?? ''
  if (href && !/^(https?:|mailto:)/i.test(href.trim())) node.removeAttribute('href')
  node.setAttribute('target', '_blank')
  node.setAttribute('rel', 'noopener noreferrer')
})

export function renderMarkdown(src: string): string {
  const html = marked.parseInline(src ?? '') as string
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'mark', 'code', 'br', 'sub', 'sup', 'span', 'a', 'img', 'del'],
    ALLOWED_ATTR: ['class', 'href', 'src', 'alt', 'title', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/(?:png|gif|jpeg|webp|svg\+xml);|blob:|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
}

export function Markdown({ src, className, as: Tag = 'span' }: { src: string; className?: string; as?: 'span' | 'div' | 'p' }) {
  const html = useMemo(() => renderMarkdown(src), [src])
  return <Tag className={cn('prose-card', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
