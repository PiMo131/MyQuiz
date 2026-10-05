import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { zipSync, strToU8 } from 'fflate'
import {
  DEFAULT_PASTE_OPTIONS,
  detectSeparators,
  parseAnkiHeaders,
  parseAnkiTxt,
  parseAny,
  parseApkg,
  parseCsv,
  parseMarkdown,
  parsePaste,
  parseQuizlet,
  parseSharedJson,
} from './parsers'
import { decodeEntities, htmlToMarkdown, markdownToHtml } from './markup'

describe('parsePaste', () => {
  it('tab + newline', () => {
    expect(parsePaste('hond\tdog\nkat\tcat\n\npaard\thorse')).toEqual([
      { term: 'hond', definition: 'dog' },
      { term: 'kat', definition: 'cat' },
      { term: 'paard', definition: 'horse' },
    ])
  })
  it('comma + semicolon', () => {
    expect(parsePaste('hond, dog; kat, cat;', { ...DEFAULT_PASTE_OPTIONS, termSep: 'comma', cardSep: 'semicolon' })).toEqual([
      { term: 'hond', definition: 'dog' },
      { term: 'kat', definition: 'cat' },
    ])
  })
  it('custom separators and swap', () => {
    const cards = parsePaste('dog - hond\n\ncat - kat', { termSep: 'custom', customTermSep: ' - ', cardSep: 'custom', customCardSep: '\\n\\n', swap: true })
    expect(cards).toEqual([
      { term: 'hond', definition: 'dog' },
      { term: 'kat', definition: 'cat' },
    ])
  })
  it('keeps rows without a definition', () => {
    expect(parsePaste('alleen term')).toEqual([{ term: 'alleen term', definition: '' }])
  })
  it('handles CRLF', () => {
    expect(parsePaste('a\tb\r\nc\td')).toHaveLength(2)
  })
})

describe('detectSeparators', () => {
  it('detects tabs', () => expect(detectSeparators('a\tb\nc\td')).toEqual({ termSep: 'tab', cardSep: 'newline' }))
  it('detects dash', () => expect(detectSeparators('a - b\nc - d')).toMatchObject({ termSep: 'custom', customTermSep: ' - ' }))
  it('detects comma', () => expect(detectSeparators('a, b\nc, d')).toMatchObject({ termSep: 'comma', cardSep: 'newline' }))
  it('detects comma + semicolon on one line', () => expect(detectSeparators('a, b; c, d')).toEqual({ termSep: 'comma', cardSep: 'semicolon' }))
  it('detects colon', () => expect(detectSeparators('hond: dog\nkat: cat')).toMatchObject({ termSep: 'custom', customTermSep: ': ' }))
})

describe('parseCsv', () => {
  it('parses csv with header and quotes', () => {
    const csv = 'term,definition,hint\n"hond, de",dog,"woef"\nkat,"cat ""tom""",\n'
    expect(parseCsv(csv)).toEqual([
      { term: 'hond, de', definition: 'dog', hint: 'woef' },
      { term: 'kat', definition: 'cat "tom"' },
    ])
  })
  it('parses tsv without header', () => {
    expect(parseCsv('hond\tdog\nkat\tcat')).toEqual([
      { term: 'hond', definition: 'dog' },
      { term: 'kat', definition: 'cat' },
    ])
  })
  it('parses semicolon csv (auto)', () => {
    expect(parseCsv('hond;dog\nkat;cat')).toHaveLength(2)
  })
  it('maps header columns in any order', () => {
    expect(parseCsv('Definition,Term\ndog,hond')).toEqual([{ term: 'hond', definition: 'dog' }])
  })
})

describe('parseAnkiTxt', () => {
  const sample = [
    '#separator:tab',
    '#html:true',
    '#guid column:1',
    '#notetype column:2',
    '#deck column:3',
    '#tags column:6',
    'abc123\tBasic\tDieren\t<b>hond</b>\tdog<br>woof\tanimals nl',
    'def456\tCloze\tDieren\tDe hoofdstad van {{c1::Frankrijk}} is {{c2::Parijs}}.\tExtra&nbsp;info\tgeo',
    'ghi789\tBasic\tDieren\tkat<img src="kat.jpg">\tcat\t',
  ].join('\n')

  it('reads headers', () => {
    const { headers, hasHeaders } = parseAnkiHeaders(sample)
    expect(hasHeaders).toBe(true)
    expect(headers).toMatchObject({ separator: '\t', html: true, guidColumn: 1, notetypeColumn: 2, deckColumn: 3, tagsColumn: 6 })
  })
  it('parses basic, cloze and media notes', () => {
    const res = parseAnkiTxt(sample)
    expect(res.source).toBe('anki')
    expect(res.cards).toHaveLength(3)
    expect(res.cards[0]).toMatchObject({ term: '**hond**', definition: 'dog\nwoof', tags: ['animals', 'nl'], externalId: 'abc123' })
    expect(res.cards[1].cloze).toBe('De hoofdstad van {{c1::Frankrijk}} is {{c2::Parijs}}.')
    expect(res.cards[1].term).toBe('De hoofdstad van Frankrijk is Parijs.')
    expect(res.cards[1].definition).toBe('Extra info')
    expect(res.cards[2]).toMatchObject({ term: 'kat', images: { term: 'kat.jpg' } })
    expect(res.warnings).toContain('mediaReferences')
  })
  it('parses legacy export without headers', () => {
    const res = parseAnkiTxt('hond\tdog\nkat\tcat\n')
    expect(res.cards.map((c) => c.term)).toEqual(['hond', 'kat'])
  })
  it('honours #separator:Semicolon and quoted fields', () => {
    const res = parseAnkiTxt('#separator:Semicolon\n#html:false\n"hond; de";dog\nkat;cat')
    expect(res.cards[0]).toEqual({ term: 'hond; de', definition: 'dog' })
  })
})

describe('parseMarkdown', () => {
  it('parses lists with title', () => {
    const res = parseMarkdown('# Dieren\n\nEen set.\n\n- hond: dog\n- **kat** — cat\n* paard - horse\n1. koe :: cow')
    expect(res.title).toBe('Dieren')
    expect(res.description).toBe('Een set.')
    expect(res.cards).toEqual([
      { term: 'hond', definition: 'dog' },
      { term: 'kat', definition: 'cat' },
      { term: 'paard', definition: 'horse' },
      { term: 'koe', definition: 'cow' },
    ])
  })
})

describe('parseQuizlet', () => {
  it('autodetects quizlet export', () => {
    expect(parseQuizlet('hond\tdog\nkat\tcat').cards).toHaveLength(2)
    expect(parseQuizlet('hond - dog\nkat - cat').cards[1]).toEqual({ term: 'kat', definition: 'cat' })
  })
})

describe('parseSharedJson / parseAny', () => {
  const shared = {
    format: 'myquizz-set',
    version: 1,
    set: { id: 's1', title: 'T', description: '', tags: ['x'], lang: { term: 'nl', definition: 'en' }, cardTypes: ['basic'], visibility: 'private', createdAt: 1, updatedAt: 1 },
    cards: [{ id: 'c1', setId: 's1', position: 0, term: 'a', definition: 'b', hint: 'h', starred: false, suspended: false, createdAt: 1, updatedAt: 1 }],
  }
  it('parses MyQuizz JSON', () => {
    const res = parseSharedJson(JSON.stringify(shared))
    expect(res.title).toBe('T')
    expect(res.externalId).toBe('s1')
    expect(res.cards[0]).toMatchObject({ term: 'a', definition: 'b', hint: 'h', externalId: 'c1' })
  })
  it('rejects other JSON', () => {
    expect(() => parseSharedJson('{"a":1}')).toThrow()
  })
  it('parseAny routes by content', () => {
    expect(parseAny(JSON.stringify(shared)).source).toBe('myquizz')
    expect(parseAny('#separator:tab\n#html:false\na\tb').source).toBe('anki')
    expect(parseAny('- a: b\n- c: d').source).toBe('markdown')
    expect(parseAny('a\tb', 'x.csv').source).toBe('csv')
    expect(parseAny('a\tb\nc\td').source).toBe('paste')
  })
})

describe('markup', () => {
  it('html → markdown', () => {
    const r = htmlToMarkdown('<b>bold</b> <i>it</i> <u>u</u><br>line&amp;<img src="a.png">[sound:b.mp3]')
    expect(r.text).toBe('**bold** *it* __u__\nline&')
    expect(r.images).toEqual(['a.png'])
    expect(r.audio).toEqual(['b.mp3'])
  })
  it('markdown → html', () => {
    expect(markdownToHtml('**b** *i* __u__ ==y:h== a<b')).toBe('<b>b</b> <i>i</i> <u>u</u> <mark>h</mark> a&lt;b')
  })
  it('invalid numeric entities never throw', () => {
    expect(decodeEntities('a&#xFFFFFFFF;b&#55296;c&#0;d&#x41;')).toBe('abcdA')
    expect(() => htmlToMarkdown('<b>x&#x110000;</b>')).not.toThrow()
  })
  it('strips scripts and event handlers from Anki HTML', () => {
    const r = htmlToMarkdown('<script>alert(1)</script><img src="x" onerror="alert(1)"><b onclick="x()">ok</b>')
    expect(r.text).toBe('alert(1)**ok**')
    expect(r.images).toEqual(['x'])
  })
})

describe('parseApkg', () => {
  it('reads notes from a legacy collection', async () => {
    const SQL = await initSqlJs()
    const sdb = new SQL.Database()
    sdb.run('CREATE TABLE col (id integer primary key, models text, decks text)')
    sdb.run('CREATE TABLE notes (id integer primary key, guid text, mid integer, flds text, tags text)')
    const models = JSON.stringify({ 1: { name: 'Basic', type: 0 }, 2: { name: 'Cloze', type: 1 } })
    const decks = JSON.stringify({ 1: { name: 'Default' }, 2: { name: 'Dieren' } })
    sdb.run('INSERT INTO col VALUES (1, ?, ?)', [models, decks])
    sdb.run('INSERT INTO notes VALUES (1, "g1", 1, ?, " nl ")', ['<b>hond</b>\x1fdog<img src="dog.jpg">'])
    sdb.run('INSERT INTO notes VALUES (2, "g2", 2, ?, "")', ['{{c1::Parijs}} is de hoofdstad\x1fextra'])
    const bytes = sdb.export()
    sdb.close()
    const zip = zipSync({
      'collection.anki2': bytes,
      media: strToU8(JSON.stringify({ '0': 'dog.jpg' })),
      '0': new Uint8Array([1, 2, 3]),
    })
    const res = parseApkg(zip, SQL)
    expect(res.source).toBe('apkg')
    expect(res.title).toBe('Dieren')
    expect(res.cards).toHaveLength(2)
    expect(res.cards[0]).toMatchObject({ term: '**hond**', definition: 'dog', tags: ['nl'], externalId: 'g1', images: { definition: 'dog.jpg' } })
    expect(res.cards[1].cloze).toBe('{{c1::Parijs}} is de hoofdstad')
    expect(res.media?.get('dog.jpg')).toEqual(new Uint8Array([1, 2, 3]))
  })
  it('throws on zstd packages', async () => {
    const SQL = await initSqlJs()
    const zip = zipSync({ 'collection.anki21b': new Uint8Array([0]) })
    expect(() => parseApkg(zip, SQL)).toThrow('apkgZstd')
  })
})
