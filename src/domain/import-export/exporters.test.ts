import { describe, expect, it } from 'vitest'
import type { Card, StudySet } from '@/domain/types'
import { exportSet, fileNameFor, toAnkiTxt, toCsv, toMarkdown, toQuizletText, toSharedSet, toTsv, dataUrlToBlob, blobToDataUrl } from './exporters'
import { parseAnkiTxt, parseCsv, parseMarkdown, parsePaste, parseSharedJson } from './parsers'
import { googleCalendarUrl, studyEvent, toIcs } from './calendar'
import { blobToBytes } from './files'

const set: StudySet = {
  id: 'set1',
  title: 'Dieren & co',
  description: 'NL → EN',
  tags: ['nl'],
  lang: { term: 'nl', definition: 'en' },
  cardTypes: ['basic'],
  visibility: 'private',
  createdAt: 1,
  updatedAt: 1,
}
const base = { setId: 'set1', starred: false, suspended: false, createdAt: 1, updatedAt: 1 }
const cards: Card[] = [
  { ...base, id: 'c1', position: 0, term: 'hond, de', definition: 'dog "woof"' },
  { ...base, id: 'c2', position: 1, term: '**kat**', definition: 'cat\nmiauw', hint: 'huisdier' },
  { ...base, id: 'c3', position: 2, term: 'Parijs is de hoofdstad', definition: 'extra', cloze: '{{c1::Parijs}} is de hoofdstad' },
]
const plain = (cs: Array<{ term: string; definition: string }>) => cs.map((c) => [c.term, c.definition])

describe('exporters round-trip', () => {
  it('csv', () => {
    const back = parseCsv(toCsv(cards))
    expect(back.map((c) => [c.term, c.definition, c.hint])).toEqual([
      ['hond, de', 'dog "woof"', undefined],
      ['**kat**', 'cat\nmiauw', 'huisdier'],
      ['Parijs is de hoofdstad', 'extra', undefined],
    ])
  })
  it('tsv (newlines flattened)', () => {
    const back = parseCsv(toTsv(cards), { delimiter: '\t', hasHeader: false })
    expect(plain(back)).toEqual([
      ['hond, de', 'dog "woof"'],
      ['**kat**', 'cat miauw'],
      ['Parijs is de hoofdstad', 'extra'],
    ])
    expect(back[1].hint).toBe('huisdier')
  })
  it('anki txt with headers, html and cloze', () => {
    const txt = toAnkiTxt(cards, set)
    expect(txt.startsWith('#separator:tab\n#html:true\n#guid column:1\n#tags column:4\n')).toBe(true)
    const back = parseAnkiTxt(txt)
    expect(back.cards).toHaveLength(3)
    expect(back.cards[0]).toMatchObject({ term: 'hond, de', definition: 'dog "woof"', externalId: 'c1', tags: ['nl'] })
    expect(back.cards[1].term).toBe('**kat**')
    expect(back.cards[1].definition).toBe('cat\nmiauw\n*huisdier*')
    expect(back.cards[2].cloze).toBe('{{c1::Parijs}} is de hoofdstad')
  })
  it('quizlet text', () => {
    const txt = toQuizletText(cards, { termSep: 'custom', customTermSep: ' - ', cardSep: 'newline' })
    const back = parsePaste(txt, { termSep: 'custom', customTermSep: ' - ', cardSep: 'newline' })
    expect(back[0]).toEqual({ term: 'hond, de', definition: 'dog "woof"' })
    expect(back).toHaveLength(3)
  })
  it('markdown', () => {
    const md = toMarkdown(set, cards)
    const back = parseMarkdown(md)
    expect(back.title).toBe('Dieren & co')
    expect(back.cards[0]).toEqual({ term: 'hond, de', definition: 'dog "woof"' })
    expect(back.cards).toHaveLength(3)
  })
  it('json (SharedSet) with media', async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    const withImg: Card[] = [{ ...cards[0], image: { term: 'm1' } }]
    const shared = await toSharedSet(set, withImg, async (id) => (id === 'm1' ? { mime: 'image/png', blob } : undefined))
    expect(shared.media?.[0]).toMatchObject({ id: 'm1', mime: 'image/png' })
    expect(shared.media?.[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect('folderId' in shared.set).toBe(false)
    const back = parseSharedJson(JSON.stringify(shared))
    expect(back.cards[0]).toMatchObject({ term: 'hond, de', externalId: 'c1' })
    const restored = await dataUrlToBlob(shared.media![0].dataUrl)
    expect(await blobToBytes(restored)).toEqual(new Uint8Array([137, 80, 78, 71]))
    expect(await blobToDataUrl(restored)).toBe(shared.media![0].dataUrl)
  })
  it('exportSet picks file names', async () => {
    const r = await exportSet('anki', set, cards)
    expect(r.fileName).toBe('Dieren-co.txt')
    expect(fileNameFor('Café ☕ / test', 'json')).toBe('Cafe-test.json')
  })
})

describe('calendar', () => {
  it('builds a 15-minute slot tomorrow and a Google url', () => {
    const now = new Date(2026, 9, 5, 14, 3)
    const ev = studyEvent('Dieren', 'https://x/#/set/1', now)
    expect(ev.title).toBe('Study Dieren on MyQuizz')
    expect(ev.start.getDate()).toBe(6)
    expect(ev.start.getMinutes()).toBe(15)
    expect(ev.end.getTime() - ev.start.getTime()).toBe(15 * 60_000)
    const url = new URL(googleCalendarUrl(ev))
    expect(url.searchParams.get('text')).toBe('Study Dieren on MyQuizz')
    expect(url.searchParams.get('dates')).toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/)
    const ics = toIcs(ev, 'uid1')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('SUMMARY:Study Dieren on MyQuizz')
    expect(ics).toContain('UID:uid1')
  })
})
