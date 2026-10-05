/**
 * Parsers for all supported import formats. Every parser returns `ParsedCard[]` (optionally with
 * set metadata). They are pure (no DB, no DOM) so they can be unit tested with sample strings.
 */
import Papa from 'papaparse'
import { unzipSync, strFromU8 } from 'fflate'
import type { LangPair, SharedSet } from '@/domain/types'
import { isCloze } from '@/domain/cloze'
import { plainText } from '@/domain/text'
import { sanitizeSharedSet } from '@/domain/share-codec'
import { htmlToMarkdown, looksLikeHtml } from './markup'

export interface ParsedCard {
  term: string
  definition: string
  hint?: string
  cloze?: string | null
  tags?: string[]
  /** Media file names referenced by the source (Anki). Resolved by the importer. */
  images?: { term?: string; definition?: string }
  audio?: { term?: string; definition?: string }
  externalId?: string
}

export type ImportSource = 'paste' | 'csv' | 'anki' | 'quizlet' | 'markdown' | 'myquizz' | 'apkg'

export interface ParseResult {
  source: ImportSource
  cards: ParsedCard[]
  title?: string
  description?: string
  lang?: LangPair
  tags?: string[]
  externalId?: string
  warnings: string[]
  /** For MyQuizz JSON: the full payload (media etc.). */
  shared?: SharedSet
  /** Binary media from .apkg keyed by original file name. */
  media?: Map<string, Uint8Array>
}

// ---------------------------------------------------------------- paste

export type TermSeparator = 'tab' | 'comma' | 'custom'
export type CardSeparator = 'newline' | 'semicolon' | 'custom'

export interface PasteOptions {
  termSep: TermSeparator
  cardSep: CardSeparator
  customTermSep?: string
  customCardSep?: string
  swap?: boolean
}

export const DEFAULT_PASTE_OPTIONS: PasteOptions = { termSep: 'tab', cardSep: 'newline', customTermSep: ' - ', customCardSep: '\n\n' }

function termSepString(o: PasteOptions): string {
  return o.termSep === 'tab' ? '\t' : o.termSep === 'comma' ? ',' : (o.customTermSep ?? '')
}
function cardSepString(o: PasteOptions): string {
  return o.cardSep === 'newline' ? '\n' : o.cardSep === 'semicolon' ? ';' : (o.customCardSep ?? '')
}

function unescapeSep(s: string): string {
  return s.replace(/\\t/g, '\t').replace(/\\n/g, '\n')
}

/** Split pasted text (Quizlet style) into cards. Empty rows are skipped; a row with only a term keeps an empty definition. */
export function parsePaste(text: string, opts: PasteOptions = DEFAULT_PASTE_OPTIONS): ParsedCard[] {
  const src = text.replace(/\r\n?/g, '\n')
  const cs = unescapeSep(cardSepString(opts))
  const ts = unescapeSep(termSepString(opts))
  if (!cs || !ts) return []
  const rows = src.split(cs)
  const out: ParsedCard[] = []
  for (const raw of rows) {
    const row = raw.replace(/^\n+|\n+$/g, '')
    if (!row.trim()) continue
    const idx = row.indexOf(ts)
    let term: string
    let definition: string
    if (idx === -1) {
      term = row.trim()
      definition = ''
    } else {
      term = row.slice(0, idx).trim()
      definition = row.slice(idx + ts.length).trim()
    }
    if (opts.swap) [term, definition] = [definition, term]
    if (!term && !definition) continue
    out.push({ term, definition })
  }
  return out
}

/** Heuristically detect separators of pasted text. */
export function detectSeparators(text: string): Pick<PasteOptions, 'termSep' | 'cardSep' | 'customTermSep'> {
  const src = text.replace(/\r\n?/g, '\n').trim()
  const lines = src.split('\n').filter((l) => l.trim())
  if (!lines.length) return { termSep: 'tab', cardSep: 'newline' }
  const count = (re: RegExp) => lines.filter((l) => re.test(l)).length
  const tabs = count(/\t/)
  const n = lines.length
  if (tabs >= n * 0.6) return { termSep: 'tab', cardSep: 'newline' }
  if (n === 1) {
    // "a, b; c, d" on one line → comma between sides, semicolon between cards
    const commaCount = (src.match(/,/g) ?? []).length
    const semiCount = (src.match(/;/g) ?? []).length
    if (semiCount >= 1 && commaCount >= semiCount) return { termSep: 'comma', cardSep: 'semicolon' }
  }
  const candidates: Array<{ sep: string; score: number }> = [
    { sep: ' - ', score: count(/ - /) },
    { sep: ' – ', score: count(/ – /) },
    { sep: ' — ', score: count(/ — /) },
    { sep: ' = ', score: count(/ = /) },
    { sep: ': ', score: count(/\S: \S/) },
    { sep: ';', score: count(/;/) },
    { sep: '|', score: count(/\|/) },
  ]
  const commas = count(/,/)
  const best = candidates.sort((a, b) => b.score - a.score)[0]
  if (best.score >= n * 0.6 && best.score >= commas) {
    return { termSep: 'custom', customTermSep: best.sep, cardSep: 'newline' }
  }
  if (commas >= n * 0.6) return { termSep: 'comma', cardSep: 'newline' }
  if (best.score >= n * 0.6) return { termSep: 'custom', customTermSep: best.sep, cardSep: 'newline' }
  return { termSep: 'tab', cardSep: 'newline' }
}

// ---------------------------------------------------------------- csv / tsv

export interface CsvOptions {
  delimiter?: string // auto when omitted
  hasHeader?: boolean // auto when omitted
}

const HEADER_WORDS = /^(term|front|question|word|definition|back|answer|meaning|hint|begrip|vraag|antwoord|betekenis|woord|tags?)$/i

/** Parse CSV/TSV. Columns: term, definition, [hint], [tags]. Header row is detected by common column names. */
export function parseCsv(text: string, opts: CsvOptions = {}): ParsedCard[] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, '').trim(), {
    delimiter: opts.delimiter ?? '',
    skipEmptyLines: 'greedy',
    quoteChar: '"',
  })
  let rows = res.data.filter((r) => r.some((c) => c?.trim()))
  if (!rows.length) return []
  const first = rows[0]
  const header = opts.hasHeader ?? (first.length >= 2 && first.slice(0, 2).every((c) => HEADER_WORDS.test(c.trim())))
  let col = { term: 0, definition: 1, hint: 2, tags: -1 }
  if (header) {
    const idx = (re: RegExp) => first.findIndex((c) => re.test(c.trim()))
    const t = idx(/^(term|front|question|word|begrip|vraag|woord)$/i)
    const d = idx(/^(definition|back|answer|meaning|antwoord|betekenis)$/i)
    const h = idx(/^hint$/i)
    const g = idx(/^tags?$/i)
    col = { term: t >= 0 ? t : 0, definition: d >= 0 ? d : 1, hint: h >= 0 ? h : -1, tags: g }
    rows = rows.slice(1)
  }
  return rows
    .map((r) => {
      const term = (r[col.term] ?? '').trim()
      const definition = (r[col.definition] ?? '').trim()
      const hint = col.hint >= 0 && !header ? (r[2] ?? '').trim() : col.hint >= 0 ? (r[col.hint] ?? '').trim() : ''
      const tags = col.tags >= 0 ? splitTags(r[col.tags] ?? '') : undefined
      const c: ParsedCard = { term, definition }
      if (hint) c.hint = hint
      if (tags?.length) c.tags = tags
      return c
    })
    .filter((c) => c.term || c.definition)
}

function splitTags(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------- anki .txt

interface AnkiHeaders {
  separator: string
  html: boolean
  tagsColumn: number // 1-based, 0 = none
  guidColumn: number
  notetypeColumn: number
  deckColumn: number
}

const ANKI_SEPARATORS: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  colon: ':',
  space: ' ',
}

export function parseAnkiHeaders(text: string): { headers: AnkiHeaders; body: string; hasHeaders: boolean } {
  const headers: AnkiHeaders = { separator: '\t', html: false, tagsColumn: 0, guidColumn: 0, notetypeColumn: 0, deckColumn: 0 }
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  let has = false
  for (; i < lines.length; i++) {
    const m = /^#\s*([a-z ]+?)\s*:\s*(.*)$/i.exec(lines[i])
    if (!m) break
    has = true
    const key = m[1].toLowerCase().trim()
    const val = m[2].trim()
    if (key === 'separator') {
      const low = val.toLowerCase()
      headers.separator = ANKI_SEPARATORS[low] ?? (val.length === 1 ? val : '\t')
    } else if (key === 'html') headers.html = /^(true|1|yes)$/i.test(val)
    else if (key === 'tags column') headers.tagsColumn = Number(val) || 0
    else if (key === 'guid column') headers.guidColumn = Number(val) || 0
    else if (key === 'notetype column') headers.notetypeColumn = Number(val) || 0
    else if (key === 'deck column') headers.deckColumn = Number(val) || 0
    // '#notetype:Basic', '#deck:...', '#columns:' are informational
  }
  return { headers, body: lines.slice(i).join('\n'), hasHeaders: has }
}

/** Convert a raw field (maybe HTML) into markdown plus media refs. */
function fieldToCard(raw: string, html: boolean): { text: string; image?: string; audio?: string } {
  if (!html && !looksLikeHtml(raw) && !raw.includes('[sound:')) return { text: raw.trim() }
  const r = htmlToMarkdown(raw)
  return { text: r.text, image: r.images[0], audio: r.audio[0] }
}

/** Build a ParsedCard from a list of note fields (first two fields are front/back). */
export function cardFromFields(fields: string[], opts: { html: boolean; tags?: string[]; guid?: string; isClozeType?: boolean }): ParsedCard | null {
  const [f0 = '', f1 = '', f2 = ''] = fields
  const front = fieldToCard(f0, opts.html)
  const back = fieldToCard(f1, opts.html)
  const extra = fieldToCard(f2, opts.html)
  if (!front.text && !back.text && !front.image && !back.image) return null
  const card: ParsedCard = { term: front.text, definition: back.text }
  if (opts.isClozeType || isCloze(front.text)) {
    card.cloze = front.text
    card.term = plainText(front.text)
    card.definition = back.text
  }
  if (front.image || back.image) card.images = { term: front.image, definition: back.image }
  if (front.audio || back.audio) card.audio = { term: front.audio, definition: back.audio }
  if (!card.cloze && extra.text && fields.length >= 3 && fields.length <= 4 && !opts.tags?.length) card.hint = extra.text
  if (opts.tags?.length) card.tags = opts.tags
  if (opts.guid) card.externalId = opts.guid
  return card
}

/** Parse an Anki "Notes in Plain Text" export (.txt) with optional `#key:value` headers. */
export function parseAnkiTxt(text: string): ParseResult {
  const { headers, body, hasHeaders } = parseAnkiHeaders(text)
  const warnings: string[] = []
  const res = Papa.parse<string[]>(body.trim(), { delimiter: headers.separator, skipEmptyLines: 'greedy', quoteChar: '"' })
  const cards: ParsedCard[] = []
  for (const row of res.data) {
    const cols = row.slice()
    const take = (n: number): string | undefined => (n > 0 && n <= cols.length ? cols[n - 1] : undefined)
    const guid = take(headers.guidColumn)
    const tagsRaw = take(headers.tagsColumn)
    const notetype = take(headers.notetypeColumn)
    const metaCols = new Set([headers.guidColumn, headers.tagsColumn, headers.notetypeColumn, headers.deckColumn].filter((n) => n > 0))
    const fields = cols.filter((_, i) => !metaCols.has(i + 1))
    const card = cardFromFields(fields, {
      html: headers.html || !hasHeaders,
      tags: tagsRaw ? splitTags(tagsRaw) : undefined,
      guid: guid?.trim() || undefined,
      isClozeType: /cloze/i.test(notetype ?? ''),
    })
    if (card) cards.push(card)
  }
  if (cards.some((c) => c.images)) warnings.push('mediaReferences')
  return { source: 'anki', cards, warnings }
}

// ---------------------------------------------------------------- markdown

/** Parse markdown lists: `- term: definition`, `- term — definition`, `* **term** – definition`, `term :: definition`. */
export function parseMarkdown(text: string): ParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const cards: ParsedCard[] = []
  let title: string | undefined
  const desc: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const h = /^#{1,2}\s+(.+)$/.exec(line)
    if (h && !title) {
      title = h[1].trim()
      continue
    }
    const li = /^(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line)
    const content = li ? li[1] : line
    const m = /^(.+?)\s*(?:\s::\s|::|\s[—–]\s|\s-\s|:\s|\t)\s*(.+)$/.exec(content)
    if (m) {
      let term = m[1].trim()
      const definition = m[2].trim()
      const bold = /^\*\*(.+)\*\*$/.exec(term)
      if (bold) term = bold[1]
      cards.push({ term, definition })
    } else if (!li && !cards.length) {
      desc.push(line)
    }
  }
  return { source: 'markdown', cards, title, description: desc.join(' ') || undefined, warnings: [] }
}

// ---------------------------------------------------------------- quizlet text export

/** Quizlet "Export" text: term/definition separated by tab (or custom), cards by newline (or custom). Auto-detects. */
export function parseQuizlet(text: string): ParseResult {
  const det = detectSeparators(text)
  const cards = parsePaste(text, { ...DEFAULT_PASTE_OPTIONS, ...det })
  return { source: 'quizlet', cards, warnings: [] }
}

// ---------------------------------------------------------------- myquizz json

export function isSharedSet(x: unknown): x is SharedSet {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return o.format === 'myquizz-set' && Array.isArray(o.cards) && !!o.set && typeof o.set === 'object'
}

export function parseSharedJson(text: string): ParseResult {
  const raw: unknown = JSON.parse(text)
  if (!isSharedSet(raw)) throw new Error('notMyQuizzSet')
  const data = sanitizeSharedSet(raw)
  const cards: ParsedCard[] = data.cards.map((c) => ({
    term: c.term,
    definition: c.definition,
    hint: c.hint,
    cloze: c.cloze ?? undefined,
    externalId: c.id,
  }))
  return {
    source: 'myquizz',
    cards,
    title: data.set.title,
    description: data.set.description,
    lang: data.set.lang,
    tags: data.set.tags,
    externalId: data.set.externalId ?? data.set.id,
    shared: data,
    warnings: [],
  }
}

// ---------------------------------------------------------------- autodetect

/** Detect the format of pasted or file text and parse it. */
export function parseAny(text: string, fileName?: string): ParseResult {
  const t = text.replace(/^﻿/, '')
  const ext = fileName?.toLowerCase().split('.').pop()
  const trimmed = t.trim()
  if (trimmed.startsWith('{') || ext === 'json') {
    try {
      return parseSharedJson(trimmed)
    } catch {
      /* fall through */
    }
  }
  if (/^#\s*(separator|html|tags column|guid column|notetype|deck|columns)\s*:/im.test(trimmed)) return parseAnkiTxt(trimmed)
  if (ext === 'md' || /^(#\s|[-*+]\s)/m.test(trimmed)) {
    const md = parseMarkdown(trimmed)
    if (md.cards.length) return md
  }
  if (ext === 'csv' || ext === 'tsv') return { source: 'csv', cards: parseCsv(trimmed, { delimiter: ext === 'tsv' ? '\t' : undefined }), warnings: [] }
  if (ext === 'txt' && looksLikeHtml(trimmed)) return parseAnkiTxt(trimmed)
  const det = detectSeparators(trimmed)
  if (det.termSep === 'comma' && /"/.test(trimmed)) return { source: 'csv', cards: parseCsv(trimmed, { delimiter: ',' }), warnings: [] }
  return { source: 'paste', cards: parsePaste(trimmed, { ...DEFAULT_PASTE_OPTIONS, ...det }), warnings: [] }
}

// ---------------------------------------------------------------- anki .apkg

/** Minimal shape of sql.js we depend on (so the parser can be tested with the real lib and stays lazy in the app). */
export interface SqlLike {
  Database: new (data?: ArrayLike<number> | null) => {
    exec(sql: string): Array<{ columns: string[]; values: Array<Array<number | string | Uint8Array | null>> }>
    close(): void
  }
}

interface AnkiModel {
  name?: string
  type?: number // 1 = cloze
  flds?: Array<{ name: string; ord?: number }>
}

/** Parse an Anki .apkg (zip with an SQLite collection). `sql` is an initialised sql.js module. */
export function parseApkg(bytes: Uint8Array, sql: SqlLike): ParseResult {
  const files = unzipSync(bytes)
  const warnings: string[] = []
  const dbName = ['collection.anki21', 'collection.anki2'].find((n) => n in files && files[n].length > 0)
  if (!dbName) {
    if ('collection.anki21b' in files) throw new Error('apkgZstd')
    throw new Error('apkgNoCollection')
  }
  const db = new sql.Database(files[dbName])
  try {
    const models = new Map<string, AnkiModel>()
    try {
      const col = db.exec('SELECT models FROM col LIMIT 1')
      const raw = col[0]?.values[0]?.[0]
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw) as Record<string, AnkiModel>
        for (const [k, v] of Object.entries(parsed)) models.set(String(k), v)
      }
    } catch {
      // newer schema: notetypes table
      try {
        const nt = db.exec('SELECT id, name, config FROM notetypes')
        for (const row of nt[0]?.values ?? []) models.set(String(row[0]), { name: String(row[1] ?? '') })
      } catch {
        /* ignore */
      }
    }
    const notes = db.exec('SELECT guid, mid, flds, tags FROM notes ORDER BY id')
    const cards: ParsedCard[] = []
    for (const row of notes[0]?.values ?? []) {
      const [guid, mid, flds, tags] = row
      const fields = String(flds ?? '').split('\x1f')
      const model = models.get(String(mid))
      const isClozeType = model?.type === 1 || /cloze/i.test(model?.name ?? '')
      const card = cardFromFields(fields, {
        html: true,
        tags: typeof tags === 'string' ? splitTags(tags) : undefined,
        guid: typeof guid === 'string' ? guid : undefined,
        isClozeType,
      })
      if (card) cards.push(card)
    }
    // media mapping: "media" file is JSON { "0": "name.jpg" } in legacy packages
    let media: Map<string, Uint8Array> | undefined
    if ('media' in files) {
      try {
        const map = JSON.parse(strFromU8(files.media)) as Record<string, string>
        media = new Map()
        for (const [num, name] of Object.entries(map)) if (num in files) media.set(name, files[num])
      } catch {
        warnings.push('mediaUnsupported')
      }
    }
    const title = (() => {
      try {
        const decks = db.exec('SELECT decks FROM col LIMIT 1')
        const raw = decks[0]?.values[0]?.[0]
        if (typeof raw === 'string') {
          const d = JSON.parse(raw) as Record<string, { name?: string }>
          const names = Object.values(d).map((x) => x.name).filter((n): n is string => !!n && n !== 'Default')
          return names[0]
        }
      } catch {
        try {
          const decks = db.exec("SELECT name FROM decks WHERE name != 'Default' LIMIT 1")
          const n = decks[0]?.values[0]?.[0]
          return typeof n === 'string' ? n : undefined
        } catch {
          return undefined
        }
      }
      return undefined
    })()
    return { source: 'apkg', cards, title, warnings, media }
  } finally {
    db.close()
  }
}
