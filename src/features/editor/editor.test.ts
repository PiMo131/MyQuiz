import { describe, expect, it } from 'vitest'
import { applyFormat, insertAtCaret, makeSearchRegex, wrapCloze } from './text-format'
import { detectLanguage, charsFor, filterLanguages } from './languages'
import { emptyCard, fromCard, isBlank, moveItem, savedAgo, swapSides, toNewCard } from './editor-state'
import type { Card } from '@/domain/types'

describe('text-format', () => {
  it('wraps and unwraps bold', () => {
    const r = applyFormat('hello world', 0, 5, 'bold')
    expect(r.value).toBe('**hello** world')
    expect([r.selectionStart, r.selectionEnd]).toEqual([2, 7])
    const back = applyFormat(r.value, r.selectionStart, r.selectionEnd, 'bold')
    expect(back.value).toBe('hello world')
  })
  it('inserts empty marks without selection', () => {
    const r = applyFormat('abc', 3, 3, 'italic')
    expect(r.value).toBe('abc**')
    expect(r.selectionStart).toBe(4)
  })
  it('highlights with colour prefix', () => {
    expect(applyFormat('x', 0, 1, 'hlBlue').value).toBe('==b:x==')
    expect(applyFormat('__x__', 0, 5, 'underline').value).toBe('x')
  })
  it('inserts at caret', () => {
    expect(insertAtCaret('ab', 1, 1, 'é')).toEqual({ value: 'aéb', selectionStart: 2, selectionEnd: 2 })
  })
  it('wraps cloze with incrementing index', () => {
    const r1 = wrapCloze('Parijs is de hoofdstad', 0, 6)
    expect(r1.value).toBe('{{c1::Parijs}} is de hoofdstad')
    const r2 = wrapCloze(r1.value, r1.value.length - 9, r1.value.length)
    expect(r2.value).toBe('{{c1::Parijs}} is de {{c2::hoofdstad}}')
  })
  it('builds search regex', () => {
    expect(makeSearchRegex('kat', { wholeWords: true, matchCase: false })!.test('de Kat')).toBe(true)
    expect(makeSearchRegex('kat', { wholeWords: true, matchCase: false })!.test('katten')).toBe(false)
    expect(makeSearchRegex('Kat', { wholeWords: false, matchCase: true })!.test('kat')).toBe(false)
    expect(makeSearchRegex('a.b', { wholeWords: false, matchCase: false })!.test('axb')).toBe(false)
    expect(makeSearchRegex('  ', { wholeWords: false, matchCase: false })).toBeNull()
  })
})

describe('languages', () => {
  it('detects nl/en/de/fr/es/it', () => {
    expect(detectLanguage('Het onder invloed van zonlicht omzetten van water en koolzuurgas in suikers')).toBe('nl')
    expect(detectLanguage('The quick brown fox jumps over the lazy dog and runs away')).toBe('en')
    expect(detectLanguage('Der Hund ist nicht im Haus und die Katze auch nicht')).toBe('de')
    expect(detectLanguage('Le chat est dans la maison avec les enfants')).toBe('fr')
    expect(detectLanguage('El perro no está en la casa con los niños')).toBe('es')
    expect(detectLanguage('Il gatto non è nella casa con i bambini')).toBe('it')
    expect(detectLanguage('Привет мир')).toBe('ru')
    expect(detectLanguage('')).toBe('')
    expect(detectLanguage('xyz qqq')).toBe('')
  })
  it('has special chars and search', () => {
    expect(charsFor('nl')).toContain('ë')
    expect(charsFor('chem')).toContain('→')
    expect(charsFor('xx')).toEqual([])
    expect(filterLanguages('duits', (c) => (c === 'de' ? 'Duits' : c)).map((l) => l.code)).toEqual(['de'])
    expect(filterLanguages('chem', () => '').map((l) => l.code)).toEqual(['chem'])
  })
})

describe('editor-state', () => {
  const card: Card = {
    id: 'c1',
    setId: 's1',
    position: 0,
    term: 'hond',
    definition: 'dog',
    hint: 'woef',
    distractors: ['kat'],
    starred: true,
    suspended: false,
    createdAt: 1,
    updatedAt: 1,
  }
  it('round-trips card ↔ editor card', () => {
    const ec = fromCard(card)
    expect(ec.distractors).toEqual(['kat', '', ''])
    expect(ec.starred).toBe(true)
    const back = toNewCard(ec, 's1')
    expect(back).toMatchObject({ id: 'c1', term: 'hond', definition: 'dog', hint: 'woef', distractors: ['kat'], starred: true, cloze: null })
    expect(back.image).toBeUndefined()
  })
  it('derives term from cloze', () => {
    const ec = { ...emptyCard(), cloze: 'De hoofdstad is {{c1::Parijs}}' }
    expect(toNewCard(ec, 's').term).toBe('De hoofdstad is Parijs')
    expect(isBlank(ec)).toBe(false)
    expect(isBlank(emptyCard())).toBe(true)
  })
  it('swaps and moves', () => {
    const ec = { ...emptyCard(), term: 'a', definition: 'b', image: { term: 'i1' } }
    expect(swapSides(ec)).toMatchObject({ term: 'b', definition: 'a', image: { definition: 'i1' } })
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1])
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
  })
  it('formats saved-ago buckets', () => {
    const now = 1_000_000
    expect(savedAgo(null)).toBeNull()
    expect(savedAgo(now - 3000, now)).toEqual({ key: 'justNow', count: 0 })
    expect(savedAgo(now - 40_000, now)).toEqual({ key: 'underMinute', count: 0 })
    expect(savedAgo(now - 5 * 60_000, now)).toEqual({ key: 'minutes', count: 5 })
    expect(savedAgo(now - 2 * 3_600_000, now)).toEqual({ key: 'hours', count: 2 })
  })
})
