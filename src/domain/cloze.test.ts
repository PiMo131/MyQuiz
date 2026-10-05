import { describe, expect, it } from 'vitest'
import { clozeIndices, isCloze, parseCloze, renderCloze } from './cloze'

describe('cloze', () => {
  const src = 'De hoofdstad van {{c1::Frankrijk::land}} is {{c2::Parijs}}.'
  it('parses parts', () => {
    const p = parseCloze(src)
    expect(p.filter((x) => x.type === 'cloze')).toHaveLength(2)
    expect(p[1]).toMatchObject({ type: 'cloze', text: 'Frankrijk', index: 1, hint: 'land' })
  })
  it('lists indices', () => expect(clozeIndices(src)).toEqual([1, 2]))
  it('renders question with blank and answers', () => {
    const r = renderCloze(src, 2)
    expect(r.question).toBe('De hoofdstad van Frankrijk is [...].')
    expect(r.answers).toEqual(['Parijs'])
    expect(r.full).toBe('De hoofdstad van Frankrijk is Parijs.')
  })
  it('detects cloze', () => {
    expect(isCloze(src)).toBe(true)
    expect(isCloze('plain')).toBe(false)
    expect(isCloze(src)).toBe(true)
  })
})
