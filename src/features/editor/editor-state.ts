/** Editor state model (pure helpers, no React). */
import { newId } from '@/domain/id'
import type { Card, OcclusionRect } from '@/domain/types'
import type { NewCard } from '@/db/repo'
import { plainText } from '@/domain/text'

export interface EditorCard {
  id: string
  term: string
  definition: string
  hint: string
  mnemonic: string
  example: string
  altAnswers: string[]
  /** null = "add multiple choice options" not opened */
  distractors: string[] | null
  image: { term?: string; definition?: string }
  cloze: string | null
  occlusion: { imageId: string; rects: OcclusionRect[] } | null
  starred: boolean
  /** UI: extras panel open */
  expanded: boolean
  createdAt?: number
}

export function emptyCard(): EditorCard {
  return {
    id: newId(),
    term: '',
    definition: '',
    hint: '',
    mnemonic: '',
    example: '',
    altAnswers: [],
    distractors: null,
    image: {},
    cloze: null,
    occlusion: null,
    starred: false,
    expanded: false,
  }
}

export function fromCard(c: Card): EditorCard {
  return {
    id: c.id,
    term: c.term,
    definition: c.definition,
    hint: c.hint ?? '',
    mnemonic: c.mnemonic ?? '',
    example: c.example ?? '',
    altAnswers: c.altAnswers ?? [],
    distractors: c.distractors && c.distractors.length ? [...c.distractors, '', '', ''].slice(0, 3) : null,
    image: { ...(c.image ?? {}) },
    cloze: c.cloze ?? null,
    occlusion: c.occlusion ?? null,
    starred: c.starred,
    expanded: false,
    createdAt: c.createdAt,
  }
}

export function isBlank(c: EditorCard): boolean {
  return !c.term.trim() && !c.definition.trim() && !c.cloze?.trim() && !c.image.term && !c.image.definition
}

export function toNewCard(c: EditorCard, setId: string): NewCard {
  const distractors = c.distractors?.map((d) => d.trim()).filter(Boolean)
  const term = c.cloze ? c.term.trim() || plainText(c.cloze) : c.term.trim()
  return {
    id: c.id,
    setId,
    term,
    definition: c.definition.trim(),
    hint: c.hint.trim() || undefined,
    mnemonic: c.mnemonic.trim() || undefined,
    example: c.example.trim() || undefined,
    altAnswers: c.altAnswers.length ? c.altAnswers : undefined,
    distractors: distractors?.length ? distractors : undefined,
    image: c.image.term || c.image.definition ? c.image : undefined,
    cloze: c.cloze?.trim() || null,
    occlusion: c.occlusion && c.occlusion.rects.length ? c.occlusion : null,
    starred: c.starred,
    createdAt: c.createdAt,
  }
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr
  const a = arr.slice()
  const [it] = a.splice(from, 1)
  a.splice(to, 0, it)
  return a
}

export function swapSides(c: EditorCard): EditorCard {
  return { ...c, term: c.definition, definition: c.term, image: { term: c.image.definition, definition: c.image.term } }
}

/** Human "saved x ago" bucket in seconds; the UI translates it. */
export function savedAgo(savedAt: number | null, now = Date.now()): { key: 'justNow' | 'underMinute' | 'minutes' | 'hours'; count: number } | null {
  if (!savedAt) return null
  const s = Math.max(0, Math.round((now - savedAt) / 1000))
  if (s < 10) return { key: 'justNow', count: 0 }
  if (s < 60) return { key: 'underMinute', count: 0 }
  if (s < 3600) return { key: 'minutes', count: Math.floor(s / 60) }
  return { key: 'hours', count: Math.floor(s / 3600) }
}
