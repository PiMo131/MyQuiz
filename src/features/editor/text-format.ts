/** Pure helpers for textarea formatting (markdown subset) and caret insertion. */

export type FormatKind = 'bold' | 'italic' | 'underline' | 'hlYellow' | 'hlBlue' | 'hlPink'

const MARKS: Record<FormatKind, { open: string; close: string }> = {
  bold: { open: '**', close: '**' },
  italic: { open: '*', close: '*' },
  underline: { open: '__', close: '__' },
  hlYellow: { open: '==y:', close: '==' },
  hlBlue: { open: '==b:', close: '==' },
  hlPink: { open: '==p:', close: '==' },
}

export interface TextEdit {
  value: string
  selectionStart: number
  selectionEnd: number
}

/** Toggle a wrapping mark around the selection. Without a selection, inserts the marks and places the caret between them. */
export function applyFormat(value: string, start: number, end: number, kind: FormatKind): TextEdit {
  const { open, close } = MARKS[kind]
  const before = value.slice(0, start)
  const sel = value.slice(start, end)
  const after = value.slice(end)
  // Unwrap when the selection is already wrapped (inside or including the marks).
  if (sel.startsWith(open) && sel.endsWith(close) && sel.length >= open.length + close.length) {
    const inner = sel.slice(open.length, sel.length - close.length)
    return { value: before + inner + after, selectionStart: start, selectionEnd: start + inner.length }
  }
  if (before.endsWith(open) && after.startsWith(close)) {
    const nb = before.slice(0, -open.length)
    return { value: nb + sel + after.slice(close.length), selectionStart: nb.length, selectionEnd: nb.length + sel.length }
  }
  const next = before + open + sel + close + after
  return { value: next, selectionStart: start + open.length, selectionEnd: start + open.length + sel.length }
}

export function insertAtCaret(value: string, start: number, end: number, text: string): TextEdit {
  const next = value.slice(0, start) + text + value.slice(end)
  return { value: next, selectionStart: start + text.length, selectionEnd: start + text.length }
}

/** Wrap selection as the next cloze deletion {{cN::…}}. */
export function wrapCloze(value: string, start: number, end: number, index?: number): TextEdit {
  const used = [...value.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]))
  const n = index ?? (used.length ? Math.max(...used) + 1 : 1)
  const sel = value.slice(start, end) || '…'
  const ins = `{{c${n}::${sel}}}`
  const next = value.slice(0, start) + ins + value.slice(end)
  const caret = value.slice(start, end) ? start + ins.length : start + `{{c${n}::`.length
  return { value: next, selectionStart: caret, selectionEnd: value.slice(start, end) ? caret : caret + 1 }
}

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent)
}

export interface SearchOptions {
  wholeWords: boolean
  matchCase: boolean
}

export function makeSearchRegex(query: string, opts: SearchOptions): RegExp | null {
  const q = query.trim()
  if (!q) return null
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const src = opts.wholeWords ? `(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])` : esc
  return new RegExp(src, opts.matchCase ? 'u' : 'iu')
}
