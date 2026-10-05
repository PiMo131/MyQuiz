/**
 * Exporters: set + cards → text formats / SharedSet JSON. Pure functions (media loading is injected).
 */
import Papa from 'papaparse'
import type { Card, SharedSet, StudySet } from '@/domain/types'
import { markdownToHtml } from './markup'
import type { CardSeparator, TermSeparator } from './parsers'

export type CardLike = Pick<Card, 'term' | 'definition'> & Partial<Pick<Card, 'id' | 'hint' | 'cloze' | 'starred'>> & { tags?: string[] }

function csvRows(cards: CardLike[], withHint: boolean): string[][] {
  return cards.map((c) => {
    const row = [c.term, c.definition]
    if (withHint) row.push(c.hint ?? '')
    return row
  })
}

export interface DelimitedOptions {
  header?: boolean
  includeHint?: boolean
}

export function toCsv(cards: CardLike[], opts: DelimitedOptions = {}): string {
  const withHint = opts.includeHint ?? cards.some((c) => c.hint)
  const rows = csvRows(cards, withHint)
  if (opts.header ?? true) rows.unshift(withHint ? ['term', 'definition', 'hint'] : ['term', 'definition'])
  return Papa.unparse(rows, { delimiter: ',', newline: '\n', quotes: false })
}

export function toTsv(cards: CardLike[], opts: DelimitedOptions = {}): string {
  const withHint = opts.includeHint ?? cards.some((c) => c.hint)
  const rows = csvRows(cards, withHint)
  if (opts.header ?? false) rows.unshift(withHint ? ['term', 'definition', 'hint'] : ['term', 'definition'])
  // Tabs/newlines inside fields are replaced so each line stays one card.
  return rows.map((r) => r.map((c) => c.replace(/[\t\n\r]+/g, ' ')).join('\t')).join('\n')
}

/**
 * Anki "Notes in Plain Text" with headers. Columns: guid, front, back, tags.
 * Markdown is converted to HTML (#html:true). Cloze cards export the cloze text as front.
 */
export function toAnkiTxt(cards: CardLike[], set?: Pick<StudySet, 'title' | 'tags'>): string {
  const lines = ['#separator:tab', '#html:true', '#guid column:1', '#tags column:4']
  if (set?.title) lines.push(`#deck:${set.title.replace(/[\t\n]/g, ' ')}`)
  const hasCloze = cards.some((c) => c.cloze)
  lines.push(`#notetype:${hasCloze ? 'Cloze' : 'Basic'}`)
  const quote = (html: string) => (/[\t"\n]/.test(html) ? `"${html.replace(/"/g, '""')}"` : html)
  for (const c of cards) {
    const front = markdownToHtml(c.cloze ?? c.term)
    let back = markdownToHtml(c.definition)
    if (!c.cloze && c.hint) back += `<br><i>${markdownToHtml(c.hint)}</i>`
    const tags = [...(set?.tags ?? []), ...(c.tags ?? []), ...(c.starred ? ['starred'] : [])].map((t) => t.replace(/\s+/g, '_')).join(' ')
    lines.push([c.id ?? '', quote(front), quote(back), tags].join('\t'))
  }
  return lines.join('\n') + '\n'
}

export interface QuizletTextOptions {
  termSep: TermSeparator
  cardSep: CardSeparator
  customTermSep?: string
  customCardSep?: string
}

/** Quizlet-style plain text with chosen separators (defaults: tab + newline). */
export function toQuizletText(cards: CardLike[], opts: QuizletTextOptions = { termSep: 'tab', cardSep: 'newline' }): string {
  const ts = opts.termSep === 'tab' ? '\t' : opts.termSep === 'comma' ? ',' : (opts.customTermSep ?? ' - ')
  const cs = opts.cardSep === 'newline' ? '\n' : opts.cardSep === 'semicolon' ? ';' : (opts.customCardSep ?? '\n\n')
  const clean = (s: string) => s.split(ts).join(' ').split(cs).join(' ').replace(/\n/g, ' ')
  return cards.map((c) => `${clean(c.term)}${ts}${clean(c.definition)}`).join(cs)
}

/** Markdown document: title, description, list of `- term — definition`. */
export function toMarkdown(set: Pick<StudySet, 'title' | 'description'>, cards: CardLike[]): string {
  const out: string[] = [`# ${set.title || 'MyQuizz'}`, '']
  if (set.description) out.push(set.description, '')
  for (const c of cards) {
    const term = (c.cloze ?? c.term).replace(/\n/g, ' ')
    const def = c.definition.replace(/\n/g, ' ')
    out.push(`- ${term} — ${def}${c.hint ? ` _(${c.hint.replace(/\n/g, ' ')})_` : ''}`)
  }
  return out.join('\n') + '\n'
}

/** Collect all media ids referenced by the cards. */
export function mediaIdsOf(cards: Card[]): string[] {
  const ids = new Set<string>()
  for (const c of cards) {
    for (const v of [c.image?.term, c.image?.definition, c.audio?.term, c.audio?.definition, c.occlusion?.imageId]) if (v) ids.add(v)
  }
  return [...ids]
}

export type MediaLoader = (id: string) => Promise<{ mime: string; blob: Blob } | undefined>

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)
  if (!m) throw new Error('badDataUrl')
  const mime = m[1] || 'application/octet-stream'
  if (m[2]) {
    const bin = atob(m[3])
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    return new Blob([u8], { type: mime })
  }
  return new Blob([decodeURIComponent(m[3])], { type: mime })
}

/** Build the SharedSet payload (media embedded as data URLs when a loader is given). */
export async function toSharedSet(set: StudySet, cards: Card[], loadMedia?: MediaLoader): Promise<SharedSet> {
  const { folderId: _f, draft: _d, ...rest } = set
  void _f
  void _d
  const shared: SharedSet = { format: 'myquizz-set', version: 1, set: rest, cards }
  if (loadMedia) {
    const media: NonNullable<SharedSet['media']> = []
    for (const id of mediaIdsOf(cards)) {
      const m = await loadMedia(id)
      if (m) media.push({ id, mime: m.mime, dataUrl: await blobToDataUrl(m.blob) })
    }
    if (media.length) shared.media = media
  }
  return shared
}

export function toJson(shared: SharedSet): string {
  return JSON.stringify(shared, null, 2)
}

/** Safe file name from a set title. */
export function fileNameFor(title: string, ext: string): string {
  const base = (title || 'myquizz-set')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `${base || 'myquizz-set'}.${ext}`
}

export type ExportFormat = 'json' | 'csv' | 'tsv' | 'anki' | 'quizlet' | 'markdown'

export const EXPORT_FORMATS: Array<{ id: ExportFormat; ext: string; mime: string }> = [
  { id: 'json', ext: 'json', mime: 'application/json' },
  { id: 'csv', ext: 'csv', mime: 'text/csv' },
  { id: 'tsv', ext: 'tsv', mime: 'text/tab-separated-values' },
  { id: 'anki', ext: 'txt', mime: 'text/plain' },
  { id: 'quizlet', ext: 'txt', mime: 'text/plain' },
  { id: 'markdown', ext: 'md', mime: 'text/markdown' },
]

export async function exportSet(
  format: ExportFormat,
  set: StudySet,
  cards: Card[],
  opts: { loadMedia?: MediaLoader; quizlet?: QuizletTextOptions } = {},
): Promise<{ text: string; fileName: string; mime: string }> {
  const meta = EXPORT_FORMATS.find((f) => f.id === format)!
  let text: string
  switch (format) {
    case 'json':
      text = toJson(await toSharedSet(set, cards, opts.loadMedia))
      break
    case 'csv':
      text = toCsv(cards)
      break
    case 'tsv':
      text = toTsv(cards)
      break
    case 'anki':
      text = toAnkiTxt(cards, set)
      break
    case 'quizlet':
      text = toQuizletText(cards, opts.quizlet)
      break
    case 'markdown':
      text = toMarkdown(set, cards)
      break
  }
  return { text, fileName: fileNameFor(set.title, meta.ext), mime: meta.mime }
}
