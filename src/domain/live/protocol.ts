/**
 * Live (play together) protocol: room codes, config, wire messages and the
 * views the authoritative host sends to players. Pure types + tiny helpers, no React.
 */
import type { Side } from '@/domain/types'

export const LIVE_PROTOCOL_VERSION = 1
export const LIVE_APP_ID = 'myquizz'
export const MAX_PLAYERS = 60
export const COUNTDOWN_MS = 3000
export const REVEAL_MS = 3500

export type LiveMode = 'classic' | 'match' | 'blast' | 'study'
export const LIVE_MODES: LiveMode[] = ['classic', 'match', 'blast', 'study']

export type MascotTheme = 'animals' | 'food' | 'space'
export type PowerUpKind = 'double' | 'saver'
export type PowerUpStatus = 'available' | 'armed' | 'used'
export type Phase = 'lobby' | 'countdown' | 'playing' | 'results'

export interface LiveConfig {
  mode: LiveMode
  teams: boolean
  teamCount: number
  mascotTheme: MascotTheme
  fastMode: boolean
  promptWith: Side
  answerWith: Side
  winners: number
  /** classic: correct answers in a row needed; study/blast: max questions (blast 0 = unlimited) */
  maxQuestions: number
  /** seconds per question (0 = no limit) */
  timePerQuestion: number
  blastSeconds: number
  matchPairs: number
  hostPlays: boolean
}

export const DEFAULT_LIVE_CONFIG: LiveConfig = {
  mode: 'classic',
  teams: false,
  teamCount: 2,
  mascotTheme: 'animals',
  fastMode: false,
  promptWith: 'term',
  answerWith: 'definition',
  winners: 1,
  maxQuestions: 12,
  timePerQuestion: 20,
  blastSeconds: 90,
  matchPairs: 6,
  hostPlays: false,
}

export interface LiveCard {
  id: string
  term: string
  definition: string
}

export interface PlayerIdentity {
  id: string
  name: string
  avatar: string
}

export interface LivePlayer extends PlayerIdentity {
  connected: boolean
  teamId: string | null
  score: number
  streak: number
  bestStreak: number
  correct: number
  wrong: number
  /** classic: consecutive correct; match: matched pairs; blast/study: answered */
  progress: number
  finishedAt: number | null
  powerUps: Record<PowerUpKind, PowerUpStatus>
  joinedAt: number
}

export interface LiveTeam {
  id: string
  name: string
  emoji: string
  color: string
}

export interface LiveQuestion {
  id: string
  n: number
  cardId: string
  prompt: string
  options: string[]
  askedAt: number
  deadlineAt: number | null
}

export interface Feedback {
  questionId: string
  correct: boolean
  points: number
  streak: number
  expected: string
  given: string | null
  usedSaver: boolean
  doubled: boolean
  at: number
}

export interface MatchTile {
  id: number
  pairId: string
  text: string
  side: Side
}

export interface LeaderboardEntry extends PlayerIdentity {
  teamId: string | null
  score: number
  progress: number
  streak: number
  connected: boolean
  rank: number
  finishedAt: number | null
}

export interface TeamStanding {
  team: LiveTeam
  score: number
  progress: number
  members: string[]
  rank: number
}

export interface MissedTerm extends LiveCard {
  count: number
}

/** Shared round (study mode): one question for everyone. */
export interface RoundView {
  n: number
  total: number
  question: LiveQuestion
  answered: number
  expected: number
  /** correct option index once revealed */
  reveal: number | null
  /** distribution of chosen options once revealed */
  distribution: number[] | null
}

export interface PublicState {
  phase: Phase
  config: LiveConfig
  now: number
  startedAt: number | null
  endsAt: number | null
  countdownEndsAt: number | null
  players: LeaderboardEntry[]
  teams: TeamStanding[]
  round: RoundView | null
  winners: string[]
  missed: MissedTerm[]
  cardCount: number
}

export interface PlayerView {
  phase: Phase
  config: LiveConfig
  now: number
  startedAt: number | null
  endsAt: number | null
  countdownEndsAt: number | null
  me: LivePlayer | null
  rank: number
  team: LiveTeam | null
  leaderboard: LeaderboardEntry[]
  teams: TeamStanding[]
  question: LiveQuestion | null
  feedback: Feedback | null
  board: MatchTile[] | null
  round: (RoundView & { myChoice: number | null }) | null
  winners: string[]
  missedMine: LiveCard[]
  cardCount: number
}

// ---------- wire messages ----------

export type ClientMessage =
  | { v: 1; t: 'hello'; player: PlayerIdentity }
  | { v: 1; t: 'answer'; questionId: string; choice: number }
  | { v: 1; t: 'power'; kind: PowerUpKind }
  | { v: 1; t: 'match'; matched: number; done: boolean }
  | { v: 1; t: 'bye' }

export type HostMessage =
  | { v: 1; t: 'welcome'; set: string; title: string; view: PlayerView }
  | { v: 1; t: 'view'; view: PlayerView }
  | { v: 1; t: 'end'; reason: 'hostLeft' | 'kicked' | 'full' | 'version' }

export const MAX_NAME_LENGTH = 24
export const MAX_AVATAR_LENGTH = 8

/** Trim, strip control/format characters and cap the length of a player-supplied name. */
export function sanitizeName(raw: unknown, fallback = 'Player', max = MAX_NAME_LENGTH): string {
  if (typeof raw !== 'string') return fallback
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '').replace(/\s+/g, ' ').trim()
  return clean.slice(0, max).trim() || fallback
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object'

export function isClientMessage(x: unknown): x is ClientMessage {
  if (!isObj(x) || x.v !== 1) return false
  switch (x.t) {
    case 'hello':
      return isObj(x.player) && typeof x.player.id === 'string' && typeof x.player.name === 'string' && typeof x.player.avatar === 'string'
    case 'answer':
      return typeof x.questionId === 'string' && typeof x.choice === 'number' && Number.isFinite(x.choice)
    case 'power':
      return x.kind === 'double' || x.kind === 'saver'
    case 'match':
      return typeof x.matched === 'number' && Number.isFinite(x.matched) && typeof x.done === 'boolean'
    case 'bye':
      return true
    default:
      return false
  }
}

export function isHostMessage(x: unknown): x is HostMessage {
  if (!isObj(x) || x.v !== 1) return false
  switch (x.t) {
    case 'welcome':
      return isObj(x.view) && typeof x.set === 'string' && typeof x.title === 'string'
    case 'view':
      return isObj(x.view)
    case 'end':
      return x.reason === 'hostLeft' || x.reason === 'kicked' || x.reason === 'full' || x.reason === 'version'
    default:
      return false
  }
}

// ---------- room codes ----------

/** No 0/O/1/I to keep codes readable on a projector. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export function generateCode(rng: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]
  return s
}

/** Uppercases and strips separators/whitespace. Validity is checked with isValidCode. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH)
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c))
}

export function formatCode(code: string): string {
  const c = code.toUpperCase()
  return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c
}

export function roomIdFor(code: string): string {
  return `myquizz-${code.toLowerCase()}`
}

export function inviteUrl(code: string, base?: string): string {
  const b = base ?? (typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '')
  return `${b}#/live/join/${code}`
}

/** Extracts a room code from a pasted invite link or raw text. */
export function codeFromText(text: string): string {
  const m = /live\/join\/([A-Za-z0-9-]{6,7})/.exec(text)
  return normalizeCode(m ? m[1] : text)
}
