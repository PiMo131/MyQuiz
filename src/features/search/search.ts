import type { Card, Folder, StudySet } from '@/domain/types'

export interface SetHit {
  kind: 'set'
  set: StudySet
  score: number
  field: 'title' | 'description' | 'tag'
}
export interface CardHit {
  kind: 'card'
  card: Card
  set?: StudySet
  score: number
  field: 'term' | 'definition'
}
export interface FolderHit {
  kind: 'folder'
  folder: Folder
  score: number
}
export type SearchHit = SetHit | CardHit | FolderHit

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[*_~`=]/g, '')
}

export function tokens(q: string): string[] {
  return normalize(q).split(/\s+/).filter(Boolean)
}

/** Score 0 (no match) .. ~100. All tokens must match; exact/prefix matches rank higher. */
export function scoreText(text: string, toks: string[]): number {
  if (!toks.length) return 0
  const n = normalize(text)
  if (!n) return 0
  let score = 0
  for (const tk of toks) {
    const idx = n.indexOf(tk)
    if (idx < 0) return 0
    score += 10
    if (idx === 0) score += 8
    else if (n[idx - 1] === ' ') score += 4
  }
  if (n === toks.join(' ')) score += 40
  else if (n.startsWith(toks.join(' '))) score += 15
  return score
}

export function searchSets(sets: StudySet[], q: string): SetHit[] {
  const toks = tokens(q)
  if (!toks.length) return []
  const out: SetHit[] = []
  for (const set of sets) {
    const title = scoreText(set.title, toks) * 2
    const desc = scoreText(set.description, toks)
    const tag = Math.max(0, ...set.tags.map((t) => scoreText(t, toks))) * 1.5
    const best = Math.max(title, desc, tag)
    if (best > 0) out.push({ kind: 'set', set, score: best, field: title > 0 ? 'title' : tag > 0 ? 'tag' : 'description' })
  }
  return out.sort((a, b) => b.score - a.score || a.set.title.localeCompare(b.set.title))
}

export function searchCards(cards: Card[], sets: Map<string, StudySet>, q: string, limit = 200): CardHit[] {
  const toks = tokens(q)
  if (!toks.length) return []
  const out: CardHit[] = []
  for (const card of cards) {
    const term = scoreText(card.term, toks)
    const def = scoreText(card.definition, toks)
    const best = Math.max(term, def)
    if (best > 0) out.push({ kind: 'card', card, set: sets.get(card.setId), score: best, field: term >= def ? 'term' : 'definition' })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

export function searchFolders(folders: Folder[], q: string): FolderHit[] {
  const toks = tokens(q)
  if (!toks.length) return []
  return folders
    .map((folder) => ({ kind: 'folder' as const, folder, score: scoreText(folder.name, toks) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
}

export interface Segment {
  text: string
  hit: boolean
}

/** Split text into highlighted / plain segments for the query tokens (accent- and case-insensitive). */
export function highlightSegments(text: string, q: string): Segment[] {
  const toks = tokens(q)
  if (!toks.length || !text) return [{ text, hit: false }]
  // Build a char map from normalized index → original index (normalize can drop combining marks).
  const lower = text.toLowerCase()
  const map: number[] = []
  let norm = ''
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i].normalize('NFD').replace(/[̀-ͯ]/g, '')
    for (let k = 0; k < ch.length; k++) {
      norm += ch[k]
      map.push(i)
    }
  }
  const marks = new Array<boolean>(text.length).fill(false)
  for (const tk of toks) {
    let from = 0
    while (from <= norm.length - tk.length) {
      const idx = norm.indexOf(tk, from)
      if (idx < 0) break
      for (let j = idx; j < idx + tk.length; j++) marks[map[j]] = true
      from = idx + tk.length
    }
  }
  const out: Segment[] = []
  let cur = ''
  let curHit = marks[0]
  for (let i = 0; i < text.length; i++) {
    if (marks[i] !== curHit) {
      if (cur) out.push({ text: cur, hit: curHit })
      cur = ''
      curHit = marks[i]
    }
    cur += text[i]
  }
  if (cur) out.push({ text: cur, hit: curHit })
  return out
}

// ---------- Recent searches (localStorage, with a tiny store for React) ----------
const RECENT_KEY = 'myquizz.recentSearches'
const recentListeners = new Set<() => void>()
let recentRaw = ''
let recentCache: string[] = []

function readRaw(): string {
  try {
    return localStorage.getItem(RECENT_KEY) ?? '[]'
  } catch {
    return '[]'
  }
}

export function getRecentSearches(): string[] {
  const raw = readRaw()
  if (raw !== recentRaw) {
    recentRaw = raw
    try {
      const v = JSON.parse(raw) as unknown
      recentCache = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : []
    } catch {
      recentCache = []
    }
  }
  return recentCache
}

function writeRecent(next: string[]): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  recentListeners.forEach((l) => l())
}

export function addRecentSearch(q: string): string[] {
  const v = q.trim()
  if (!v) return getRecentSearches()
  const next = [v, ...getRecentSearches().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 8)
  writeRecent(next)
  return next
}

export function clearRecentSearches(): void {
  try { localStorage.removeItem(RECENT_KEY) } catch { /* ignore */ }
  recentListeners.forEach((l) => l())
}

export function subscribeRecentSearches(l: () => void): () => void {
  recentListeners.add(l)
  return () => recentListeners.delete(l)
}
