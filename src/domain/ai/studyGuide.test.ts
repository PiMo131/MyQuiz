import { describe, expect, it } from 'vitest'
import { buildOutline, buildStudyGuide, extractKeyTerms } from './studyGuide'

const NOTES = `# De Franse Revolutie

## Oorzaken
De staatsschuld was enorm na dure oorlogen. De derde stand betaalde de meeste belasting.
- Hongersnood door mislukte oogsten
- Verlichtingsideeën over gelijkheid

## Verloop
Bastille: gevangenis in Parijs die op 14 juli 1789 werd bestormd.
De Nationale Vergadering stelde de Verklaring van de Rechten van de Mens op. Robespierre leidde later de Terreur.

## Gevolgen
De monarchie werd afgeschaft. Napoleon greep uiteindelijk de macht.
`

describe('buildOutline', () => {
  it('turns markdown headings into sections with points', () => {
    const outline = buildOutline(NOTES, 'x')
    const headings = outline.map((s) => s.heading)
    expect(headings).toEqual(['De Franse Revolutie', 'Oorzaken', 'Verloop', 'Gevolgen'])
    const oorzaken = outline.find((s) => s.heading === 'Oorzaken')!
    expect(oorzaken.points).toContain('Hongersnood door mislukte oogsten')
    expect(oorzaken.points[0]).toMatch(/^De staatsschuld/)
  })
})

describe('extractKeyTerms', () => {
  it('finds defined terms and proper nouns', () => {
    const terms = extractKeyTerms(NOTES).map((k) => k.term)
    expect(terms).toContain('Bastille')
    expect(terms.some((t) => /Robespierre|Napoleon/.test(t))).toBe(true)
  })
})

describe('buildStudyGuide', () => {
  it('produces title, summary, questions and cards', () => {
    const g = buildStudyGuide(NOTES, { lang: 'nl' })
    expect(g.title).toBe('De Franse Revolutie')
    expect(g.summary.length).toBeGreaterThanOrEqual(2)
    expect(g.questions.length).toBeGreaterThan(0)
    expect(g.questions[0].question).toMatch(/^Wat is /)
    expect(g.cards.some((c) => c.term === 'Bastille')).toBe(true)
    expect(g.outline.length).toBe(4)
  })
})
