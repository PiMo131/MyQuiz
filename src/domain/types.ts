/**
 * Shared domain types for MyQuizz. This file is the contract between all features.
 * Only the orchestrator changes it; feature code imports from '@/domain/types'.
 */

export type Id = string

export type Side = 'term' | 'definition'
export type CardType = 'basic' | 'reverse' | 'cloze' | 'occlusion' | 'typeIn'
export type Visibility = 'private' | 'password'

export interface LangPair {
  term: string // BCP-47, e.g. 'nl', 'en', 'de'; '' = unknown
  definition: string
}

export interface StudySet {
  id: Id
  title: string
  description: string
  folderId?: Id | null
  tags: string[]
  lang: LangPair
  cardTypes: CardType[] // which card variants to generate; default ['basic']
  visibility: Visibility
  author?: string
  externalId?: string // id from the sharing origin, used to update instead of duplicate on re-import
  draft?: boolean
  createdAt: number
  updatedAt: number
  lastStudiedAt?: number
}

export interface OcclusionRect {
  id: string
  x: number // 0..1 relative
  y: number
  w: number
  h: number
  label?: string
}

export interface Card {
  id: Id
  setId: Id
  position: number
  term: string // markdown allowed (bold/italic/underline/highlight)
  definition: string
  hint?: string
  mnemonic?: string
  example?: string
  altAnswers?: string[] // extra accepted answers
  distractors?: string[] // user-supplied multiple-choice options (max 3)
  image?: { term?: Id; definition?: Id } // media ids
  audio?: { term?: Id; definition?: Id }
  cloze?: string | null // text containing {{c1::answer::hint}}; when set, card is a cloze card
  occlusion?: { imageId: Id; rects: OcclusionRect[] } | null
  starred: boolean
  suspended: boolean
  flag?: 'red' | 'orange' | 'green' | 'blue' | null
  leech?: boolean
  createdAt: number
  updatedAt: number
}

export interface MediaItem {
  id: Id
  mime: string
  blob: Blob
  width?: number
  height?: number
  createdAt: number
}

export interface Folder {
  id: Id
  name: string
  parentId?: Id | null
  color?: string
  createdAt: number
  updatedAt: number
}

/** 'forward' = term→definition, 'reverse' = definition→term, 'cloze:1' = cloze deletion n */
export type Variant = 'forward' | 'reverse' | `cloze:${number}` | `occ:${string}`

export type Bucket = 'new' | 'learning' | 'known' | 'mastered'

/** Mirrors ts-fsrs Card fields, stored as plain numbers/ISO for IndexedDB. */
export interface FsrsState {
  due: number // epoch ms
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: 0 | 1 | 2 | 3 // New, Learning, Review, Relearning
  last_review?: number
}

export interface Progress {
  id: string // `${cardId}:${variant}`
  cardId: Id
  setId: Id
  variant: Variant
  fsrs: FsrsState
  bucket: Bucket
  confidence?: 1 | 2 | 3 | 4 | 5
  correct: number
  incorrect: number
  lastMode?: StudyMode
  updatedAt: number
}

export type Rating = 1 | 2 | 3 | 4 // Again, Hard, Good, Easy

export type StudyMode =
  | 'flashcards'
  | 'srs'
  | 'learn'
  | 'write'
  | 'spell'
  | 'test'
  | 'match'
  | 'blocks'
  | 'blast'
  | 'charms'
  | 'hangman'
  | 'wordsearch'
  | 'speedreview'
  | 'live'

export interface RevlogEntry {
  id?: number // auto-increment
  cardId: Id
  setId: Id
  variant: Variant
  ts: number
  rating: Rating
  state: FsrsState['state']
  scheduledDays: number
  elapsedDays: number
  durationMs: number
  mode: StudyMode
}

export interface SessionAnswer {
  cardId: Id
  questionType: QuestionType
  prompt: string
  given: string
  expected: string
  correct: boolean
  durationMs: number
}

export interface Session {
  id: Id
  setId: Id
  mode: StudyMode
  startedAt: number
  finishedAt?: number
  score?: number // 0..1 or game score
  total?: number
  answers: SessionAnswer[]
  settings?: Record<string, unknown>
}

export type QuestionType =
  | 'multipleChoice'
  | 'trueFalse'
  | 'written'
  | 'matching'
  | 'flashcard'
  | 'ordering'
  | 'multiSelect'
  | 'fillBlank'

export type GradingStrictness = 'relaxed' | 'moderate' | 'strict'

export interface GradingOptions {
  strictness: GradingStrictness
  caseSensitive?: boolean
  ignoreAccents?: boolean
  ignoreParentheses?: boolean
  acceptAlternatives?: boolean // "a / b" accepts a or b
}

export interface SrsParams {
  requestRetention: number // 0.7..0.98
  maximumInterval: number // days
  newPerDay: number
  reviewsPerDay: number
  learningSteps: string[] // ['1m','10m']
  relearningSteps: string[]
  leechThreshold: number
  leechAction: 'tag' | 'suspend'
  enableFuzz: boolean
}

export type AiProviderKind = 'auto' | 'heuristics' | 'chrome-nano' | 'webllm' | 'byok'
export type ByokVendor = 'gemini' | 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'custom'

export interface AiSettings {
  provider: AiProviderKind
  webllmModel?: string
  webllmConsent?: boolean
  byok?: { vendor: ByokVendor; apiKey: string; model?: string; baseUrl?: string } | null
  proxyUrl?: string // optional Cloudflare Worker proxy
}

export interface Settings {
  locale: 'nl' | 'en'
  theme: 'system' | 'light' | 'dark'
  displayName: string
  avatar: string // emoji or data url
  tts: { enabled: boolean; voiceByLang: Record<string, string>; rate: number }
  sounds: boolean
  srs: SrsParams
  grading: GradingOptions
  ai: AiSettings
  onboarded: boolean
  notifications: { dailyReminder: boolean; hour: number }
}

export interface Achievement {
  id: string
  unlockedAt: number
}

export interface Streak {
  id: 'streak'
  current: number
  longest: number
  lastDay: string // YYYY-MM-DD
  days: string[] // studied days (YYYY-MM-DD), capped at 400
}

export interface Notification {
  id: Id
  type: 'due' | 'streak' | 'achievement' | 'info' | 'share'
  title: string
  body?: string
  link?: string
  createdAt: number
  read: boolean
}

/** One-set share/export payload (no progress). */
export interface SharedSet {
  format: 'myquizz-set'
  version: 1
  set: Omit<StudySet, 'folderId' | 'draft'>
  cards: Card[]
  media?: Array<{ id: Id; mime: string; dataUrl: string }>
}

/** Full backup payload. Media is embedded as data URLs (JSON) or shipped in ZIP as files. */
export interface Backup {
  format: 'myquizz-backup'
  version: 1
  exportedAt: string
  app: { version: string }
  settings?: Partial<Settings>
  folders: Folder[]
  sets: StudySet[]
  cards: Card[]
  media?: Array<{ id: Id; mime: string; dataUrl?: string; file?: string }>
  progress: Progress[]
  revlog: RevlogEntry[]
  sessions: Session[]
  achievements: Achievement[]
  streak?: Streak
}

export const DEFAULT_SRS: SrsParams = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  newPerDay: 20,
  reviewsPerDay: 200,
  learningSteps: ['1m', '10m'],
  relearningSteps: ['10m'],
  leechThreshold: 8,
  leechAction: 'tag',
  enableFuzz: true,
}

export const DEFAULT_GRADING: GradingOptions = {
  strictness: 'moderate',
  caseSensitive: false,
  ignoreAccents: true,
  ignoreParentheses: true,
  acceptAlternatives: true,
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'nl',
  theme: 'system',
  displayName: '',
  avatar: '🦊',
  tts: { enabled: true, voiceByLang: {}, rate: 1 },
  sounds: true,
  srs: DEFAULT_SRS,
  grading: DEFAULT_GRADING,
  ai: { provider: 'auto', webllmConsent: false, byok: null },
  onboarded: false,
  notifications: { dailyReminder: false, hour: 18 },
}

export const APP_VERSION = '0.1.0'
export const APP_NAME = 'MyQuizz'
