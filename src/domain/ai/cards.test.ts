import { describe, expect, it } from 'vitest'
import { applyCardStyle, extractCards } from './cards'

const NL_NOTES = `Biologie hoofdstuk 3

Fotosynthese: het proces waarbij planten licht omzetten in energie.
Chlorofyl — de groene kleurstof in bladeren.
Mitochondrium - de energiecentrale van de cel.

De celkern is het deel van de cel dat het DNA bevat.
Osmose is de verplaatsing van water door een membraan.

Q: Wat is een enzym?
A: Een eiwit dat reacties versnelt.

- Ribosoom
  - Maakt eiwitten aan
`

const EN_NOTES = `**Active recall**: retrieving information from memory without looking at notes.
Spaced repetition — reviewing material at increasing intervals.
Interleaving is a study method where you mix different topics in one session.
Why is sleep important for memory?
Sleep consolidates what you learned during the day.
`

describe('extractCards', () => {
  it('extracts Dutch notes with mixed patterns', () => {
    const cards = extractCards(NL_NOTES)
    const terms = cards.map((c) => c.term)
    expect(terms).toContain('Fotosynthese')
    expect(terms).toContain('Chlorofyl')
    expect(terms).toContain('Mitochondrium')
    expect(terms).toContain('Wat is een enzym?')
    expect(terms).toContain('Ribosoom')
    expect(terms.some((t) => /celkern/i.test(t))).toBe(true)
    expect(terms.some((t) => /osmose/i.test(t))).toBe(true)
    const foto = cards.find((c) => c.term === 'Fotosynthese')!
    expect(foto.definition).toMatch(/^het proces/)
    expect(cards.find((c) => c.term === 'Wat is een enzym?')!.definition).toBe('Een eiwit dat reacties versnelt.')
    // the heading should not become a card with a colon-less paragraph of itself
    expect(terms).not.toContain('Biologie hoofdstuk 3')
  })

  it('extracts English notes incl. bold terms and question/answer lines', () => {
    const cards = extractCards(EN_NOTES)
    const byTerm = Object.fromEntries(cards.map((c) => [c.term, c.definition]))
    expect(byTerm['Active recall']).toMatch(/^retrieving information/)
    expect(byTerm['Spaced repetition']).toMatch(/^reviewing material/)
    expect(byTerm['Interleaving']).toMatch(/study method/)
    expect(byTerm['Why is sleep important for memory?']).toMatch(/^Sleep consolidates/)
  })

  it('dedupes terms and respects the cap', () => {
    const text = Array.from({ length: 80 }, (_, i) => `Term ${i % 70}: definition ${i}`).join('\n')
    const cards = extractCards(text)
    expect(cards.length).toBe(60)
    expect(new Set(cards.map((c) => c.term.toLowerCase())).size).toBe(60)
  })

  it('handles TSV / CSV with semicolons', () => {
    const cards = extractCards('hond;dog\nkat;cat\nvogel;bird')
    expect(cards).toHaveLength(3)
    expect(cards[1]).toMatchObject({ term: 'kat', definition: 'cat' })
  })

  it('ignores URLs and clock times as separators', () => {
    const cards = extractCards('Zie https://example.com/x voor meer\nAfspraak 12:30 morgen')
    expect(cards.find((c) => c.term === 'Zie https')).toBeUndefined()
    expect(cards.find((c) => c.term === 'Afspraak 12')).toBeUndefined()
  })

  it('returns an empty list for prose without definitions', () => {
    expect(extractCards('Ik ging gisteren naar de winkel en kocht brood.')).toEqual([])
  })
})

describe('applyCardStyle', () => {
  const base = [{ term: 'Osmose', definition: 'Verplaatsing van water door een membraan' }]
  it('turns terms into questions', () => {
    expect(applyCardStyle(base, 'qa', 'nl')[0].term).toBe('Wat is Osmose?')
    expect(applyCardStyle(base, 'qa', 'en')[0].term).toBe('What is Osmose?')
  })
  it('builds cloze text', () => {
    const c = applyCardStyle([{ term: 'water', definition: 'Osmose is verplaatsing van water door een membraan' }], 'cloze', 'nl')[0]
    expect(c.cloze).toBe('Osmose is verplaatsing van {{c1::water}} door een membraan')
    expect(applyCardStyle(base, 'cloze', 'nl')[0].cloze).toContain('{{c1::Osmose}}')
  })
})
