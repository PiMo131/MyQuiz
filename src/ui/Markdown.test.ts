import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './Markdown'

describe('renderMarkdown', () => {
  it('renders the card subset', () => {
    expect(renderMarkdown('**b** *i* ==y:h==')).toBe('<strong>b</strong> <em>i</em> <mark class="hl-yellow">h</mark>')
  })
  it('strips scripts, event handlers and javascript: URLs', () => {
    expect(renderMarkdown('<script>alert(1)</script>x')).toBe('x')
    expect(renderMarkdown('<img src="x" onerror="alert(1)">')).toBe('<img src="x">')
    expect(renderMarkdown('[click](javascript:alert(1))')).not.toContain('javascript:')
    expect(renderMarkdown('<a href="vbscript:x">y</a>')).not.toContain('vbscript')
    expect(renderMarkdown('<iframe src="https://x"></iframe><style>*{}</style>ok')).toBe('ok')
  })
  it('forces safe link targets', () => {
    const html = renderMarkdown('[site](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(renderMarkdown('<a href="https://x" target="_self" rel="opener">y</a>')).toContain('rel="noopener noreferrer"')
  })
  it('keeps image data URLs but not html data URLs', () => {
    expect(renderMarkdown('<img src="data:image/png;base64,AAAA">')).toContain('data:image/png')
    expect(renderMarkdown('<a href="data:text/html,<script>">y</a>')).not.toContain('href')
  })
})
