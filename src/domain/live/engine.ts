/**
 * Authoritative live-game engine: a pure reducer the host runs. Players only
 * ever see the views produced by `playerView()`; the host screen uses `publicState()`.
 */
import type { Side } from '@/domain/types'
import { mulberry32, shuffle } from '@/domain/text'
import { answerPoints, matchPoints } from './scoring'
import {
  COUNTDOWN_MS,
  DEFAULT_LIVE_CONFIG,
  MAX_PLAYERS,
  REVEAL_MS,
  type Feedback,
  type LeaderboardEntry,
  type LiveCard,
  type LiveConfig,
  type LivePlayer,
  type LiveQuestion,
  type LiveTeam,
  type MascotTheme,
  type MatchTile,
  type MissedTerm,
  type Phase,
  type PlayerIdentity,
  type PlayerView,
  type PowerUpKind,
  type PublicState,
  type RoundView,
  type TeamStanding,
} from './protocol'

// ---------- state ----------

export interface HostQuestion extends LiveQuestion {
  correctIndex: number
  expected: string
}

export interface Round {
  n: number
  question: HostQuestion
  answers: Record<string, { choice: number; at: number }>
  revealedAt: number | null
}

export interface AnswerRecord {
  playerId: string
  cardId: string
  prompt: string
  given: string
  expected: string
  correct: boolean
  durationMs: number
  at: number
}

export interface LiveState {
  phase: Phase
  config: LiveConfig
  cards: LiveCard[]
  players: Record<string, LivePlayer>
  order: string[]
  teams: LiveTeam[]
  seed: number
  startedAt: number | null
  endsAt: number | null
  countdownEndsAt: number | null
  /** current question per player (classic/blast) */
  questions: Record<string, HostQuestion>
  asked: Record<string, number>
  feedback: Record<string, Feedback>
  round: Round | null
  roundsPlayed: number
  board: MatchTile[] | null
  missed: Record<string, number>
  missedBy: Record<string, string[]>
  answers: AnswerRecord[]
  winners: string[]
}

export type LiveEvent =
  | { type: 'configure'; config: Partial<LiveConfig> }
  | { type: 'join'; player: PlayerIdentity; at: number }
  | { type: 'leave'; playerId: string; at: number }
  | { type: 'kick'; playerId: string }
  | { type: 'start'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'answer'; playerId: string; questionId: string; choice: number; at: number }
  | { type: 'power'; playerId: string; kind: PowerUpKind; at: number }
  | { type: 'match'; playerId: string; matched: number; done: boolean; at: number }
  | { type: 'nextRound'; at: number }
  | { type: 'end'; at: number }
  | { type: 'reset' }

export const MASCOTS: Record<MascotTheme, Array<{ emoji: string; color: string }>> = {
  animals: [
    { emoji: '🦊', color: '#f97316' },
    { emoji: '🐼', color: '#64748b' },
    { emoji: '🐸', color: '#22c55e' },
    { emoji: '🦉', color: '#8b5cf6' },
    { emoji: '🐙', color: '#ec4899' },
    { emoji: '🐢', color: '#14b8a6' },
    { emoji: '🦁', color: '#eab308' },
    { emoji: '🐧', color: '#3b82f6' },
  ],
  food: [
    { emoji: '🍕', color: '#ef4444' },
    { emoji: '🥑', color: '#22c55e' },
    { emoji: '🍩', color: '#ec4899' },
    { emoji: '🌮', color: '#f97316' },
    { emoji: '🍇', color: '#8b5cf6' },
    { emoji: '🍋', color: '#eab308' },
    { emoji: '🧁', color: '#06b6d4' },
    { emoji: '🍉', color: '#10b981' },
  ],
  space: [
    { emoji: '🚀', color: '#6366f1' },
    { emoji: '🪐', color: '#f59e0b' },
    { emoji: '👽', color: '#22c55e' },
    { emoji: '☄️', color: '#ef4444' },
    { emoji: '🛸', color: '#06b6d4' },
    { emoji: '🌙', color: '#eab308' },
    { emoji: '⭐', color: '#f97316' },
    { emoji: '🛰️', color: '#8b5cf6' },
  ],
}

export const TEAM_NAMES: Record<MascotTheme, string[]> = {
  animals: ['Foxes', 'Pandas', 'Frogs', 'Owls', 'Octopi', 'Turtles', 'Lions', 'Penguins'],
  food: ['Pizzas', 'Avocados', 'Donuts', 'Tacos', 'Grapes', 'Lemons', 'Cupcakes', 'Melons'],
  space: ['Rockets', 'Saturns', 'Aliens', 'Comets', 'UFOs', 'Moons', 'Stars', 'Satellites'],
}

export function createState(cards: LiveCard[], config: Partial<LiveConfig> = {}, seed = 1): LiveState {
  return {
    phase: 'lobby',
    config: { ...DEFAULT_LIVE_CONFIG, ...config },
    cards,
    players: {},
    order: [],
    teams: [],
    seed,
    startedAt: null,
    endsAt: null,
    countdownEndsAt: null,
    questions: {},
    asked: {},
    feedback: {},
    round: null,
    roundsPlayed: 0,
    board: null,
    missed: {},
    missedBy: {},
    answers: [],
    winners: [],
  }
}

export function newPlayer(p: PlayerIdentity, at: number): LivePlayer {
  return {
    ...p,
    connected: true,
    teamId: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    wrong: 0,
    progress: 0,
    finishedAt: null,
    powerUps: { double: 'available', saver: 'available' },
    joinedAt: at,
  }
}

// ---------- helpers ----------

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function sideText(card: LiveCard, side: Side): string {
  return side === 'term' ? card.term : card.definition
}

function limitMs(config: LiveConfig): number {
  return config.timePerQuestion > 0 ? config.timePerQuestion * 1000 : 0
}

/** Build a multiple-choice question for card `cardIndex` (deterministic given the rng). */
export function buildQuestion(
  cards: LiveCard[],
  cardIndex: number,
  config: LiveConfig,
  rng: () => number,
  id: string,
  n: number,
  at: number,
): HostQuestion {
  const card = cards[cardIndex]
  const expected = sideText(card, config.answerWith)
  const pool = cards.filter((c, i) => i !== cardIndex && sideText(c, config.answerWith) !== expected)
  const distractors = shuffle(pool, rng)
    .map((c) => sideText(c, config.answerWith))
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 3)
  const options = shuffle([expected, ...distractors], rng)
  const limit = limitMs(config)
  return {
    id,
    n,
    cardId: card.id,
    prompt: sideText(card, config.promptWith),
    options,
    correctIndex: options.indexOf(expected),
    expected,
    askedAt: at,
    deadlineAt: limit > 0 ? at + limit : null,
  }
}

/** Per-player card order: a seeded shuffle so each player sees every card before repeats. */
function cardIndexFor(state: LiveState, playerId: string, n: number): number {
  const rng = mulberry32(state.seed ^ hashStr(playerId))
  const order = shuffle(
    state.cards.map((_, i) => i),
    rng,
  )
  return order[n % order.length]
}

function nextQuestionFor(state: LiveState, playerId: string, at: number): LiveState {
  if (!state.cards.length) return state
  const n = state.asked[playerId] ?? 0
  const rng = mulberry32((state.seed + n * 7919) ^ hashStr(playerId))
  const q = buildQuestion(state.cards, cardIndexFor(state, playerId, n), state.config, rng, `${playerId}:${n}`, n, at)
  return {
    ...state,
    questions: { ...state.questions, [playerId]: q },
    asked: { ...state.asked, [playerId]: n + 1 },
  }
}

/** 12-tile board (6 pairs) shared by all players in Multiplayer Match. */
export function buildBoard(cards: LiveCard[], pairs: number, seed: number): MatchTile[] {
  const rng = mulberry32(seed)
  const chosen = shuffle(cards, rng).slice(0, Math.max(1, Math.min(pairs, cards.length)))
  const tiles: MatchTile[] = []
  chosen.forEach((c) => {
    tiles.push({ id: 0, pairId: c.id, text: c.term, side: 'term' })
    tiles.push({ id: 0, pairId: c.id, text: c.definition, side: 'definition' })
  })
  return shuffle(tiles, rng).map((t, i) => ({ ...t, id: i }))
}

function makeRound(state: LiveState, n: number, at: number): Round {
  const rng = mulberry32(state.seed + n * 104729)
  const order = shuffle(
    state.cards.map((_, i) => i),
    mulberry32(state.seed),
  )
  const q = buildQuestion(state.cards, order[n % order.length], state.config, rng, `r${n}`, n, at)
  return { n, question: q, answers: {}, revealedAt: null }
}

export function assignTeams(state: LiveState): LiveState {
  if (!state.config.teams) return { ...state, teams: [] }
  const ids = state.order.filter((id) => state.players[id]?.connected)
  const count = Math.max(2, Math.min(state.config.teamCount, MASCOTS[state.config.mascotTheme].length, Math.max(2, ids.length)))
  const mascots = MASCOTS[state.config.mascotTheme]
  const names = TEAM_NAMES[state.config.mascotTheme]
  const teams: LiveTeam[] = Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    name: names[i],
    emoji: mascots[i].emoji,
    color: mascots[i].color,
  }))
  const shuffled = shuffle(ids, mulberry32(state.seed + 17))
  const players = { ...state.players }
  shuffled.forEach((id, i) => {
    players[id] = { ...players[id], teamId: teams[i % count].id }
  })
  return { ...state, teams, players }
}

function resetScores(players: Record<string, LivePlayer>): Record<string, LivePlayer> {
  const out: Record<string, LivePlayer> = {}
  for (const [id, p] of Object.entries(players)) {
    out[id] = {
      ...p,
      score: 0,
      streak: 0,
      bestStreak: 0,
      correct: 0,
      wrong: 0,
      progress: 0,
      finishedAt: null,
      teamId: null,
      powerUps: { double: 'available', saver: 'available' },
    }
  }
  return out
}

function beginPlaying(state: LiveState, at: number): LiveState {
  let s: LiveState = {
    ...state,
    phase: 'playing',
    startedAt: at,
    countdownEndsAt: null,
    endsAt: state.config.mode === 'blast' ? at + state.config.blastSeconds * 1000 : null,
    players: resetScores(state.players),
    questions: {},
    asked: {},
    feedback: {},
    round: null,
    roundsPlayed: 0,
    board: null,
    missed: {},
    missedBy: {},
    answers: [],
    winners: [],
  }
  s = assignTeams(s)
  switch (s.config.mode) {
    case 'classic':
    case 'blast':
      for (const id of s.order) if (s.players[id].connected) s = nextQuestionFor(s, id, at)
      break
    case 'match':
      s = { ...s, board: buildBoard(s.cards, s.config.matchPairs, s.seed) }
      break
    case 'study':
      s = { ...s, round: makeRound(s, 0, at) }
      break
  }
  return s
}

function winningUnits(state: LiveState): number {
  if (!state.config.teams) return state.winners.length
  return new Set(state.winners.map((id) => state.players[id]?.teamId)).size
}

function finishIfNeeded(state: LiveState, at: number): LiveState {
  const connected = state.order.filter((id) => state.players[id].connected)
  const allDone = connected.length > 0 && connected.every((id) => state.players[id].finishedAt !== null)
  if (winningUnits(state) >= state.config.winners || allDone) return { ...state, phase: 'results', endsAt: at }
  return state
}

function recordMiss(state: LiveState, cardId: string, playerId: string): LiveState {
  return {
    ...state,
    missed: { ...state.missed, [cardId]: (state.missed[cardId] ?? 0) + 1 },
    missedBy: { ...state.missedBy, [playerId]: [...(state.missedBy[playerId] ?? []), cardId] },
  }
}

/** Grade one answer for a player (shared by per-player streams and shared rounds). */
function gradeAnswer(state: LiveState, playerId: string, q: HostQuestion, choice: number, at: number): LiveState {
  const p = state.players[playerId]
  if (!p) return state
  const correct = choice === q.correctIndex
  const limit = limitMs(state.config)
  const remaining = q.deadlineAt ? Math.max(0, q.deadlineAt - at) : limit
  let { streak, progress } = p
  const powerUps = { ...p.powerUps }
  let usedSaver = false
  let doubled = false
  let points = 0
  if (correct) {
    streak += 1
    progress += 1
    doubled = powerUps.double === 'armed'
    if (doubled) powerUps.double = 'used'
    points = answerPoints({ correct, remainingMs: remaining, limitMs: limit, streakAfter: streak, doubled })
  } else {
    if (powerUps.saver === 'available') {
      powerUps.saver = 'used'
      usedSaver = true
    } else {
      streak = 0
      if (state.config.mode === 'classic' && !state.config.fastMode) progress = 0
    }
    if (state.config.mode !== 'classic') progress += 1
  }
  const given = choice >= 0 && choice < q.options.length ? q.options[choice] : null
  const next: LivePlayer = {
    ...p,
    streak,
    bestStreak: Math.max(p.bestStreak, streak),
    progress,
    score: p.score + points,
    correct: p.correct + (correct ? 1 : 0),
    wrong: p.wrong + (correct ? 0 : 1),
    powerUps,
  }
  const feedback: Feedback = { questionId: q.id, correct, points, streak, expected: q.expected, given, usedSaver, doubled, at }
  let s: LiveState = {
    ...state,
    players: { ...state.players, [playerId]: next },
    feedback: { ...state.feedback, [playerId]: feedback },
    answers: [
      ...state.answers,
      { playerId, cardId: q.cardId, prompt: q.prompt, given: given ?? '', expected: q.expected, correct, durationMs: at - q.askedAt, at },
    ],
  }
  if (!correct) s = recordMiss(s, q.cardId, playerId)
  return s
}

function afterPersonalAnswer(state: LiveState, playerId: string, at: number): LiveState {
  let s = state
  const p = s.players[playerId]
  const { mode, maxQuestions } = s.config
  if (mode === 'classic' && p.progress >= maxQuestions && p.finishedAt === null) {
    s = { ...s, players: { ...s.players, [playerId]: { ...p, finishedAt: at } }, winners: [...s.winners, playerId] }
    s = finishIfNeeded(s, at)
    if (s.phase === 'results') return s
    const rest = { ...s.questions }
    delete rest[playerId]
    return { ...s, questions: rest }
  }
  if (mode === 'blast' && maxQuestions > 0 && p.progress >= maxQuestions) {
    s = { ...s, players: { ...s.players, [playerId]: { ...p, finishedAt: at } } }
    const rest = { ...s.questions }
    delete rest[playerId]
    s = { ...s, questions: rest }
    const connected = s.order.filter((id) => s.players[id].connected)
    if (connected.every((id) => s.players[id].finishedAt !== null)) return endGame(s, at)
    return s
  }
  return nextQuestionFor(s, playerId, at)
}

function endGame(state: LiveState, at: number): LiveState {
  const ranked = rankPlayers(state)
  const winners = state.winners.length ? state.winners : ranked.slice(0, Math.max(1, state.config.winners)).map((e) => e.id)
  return { ...state, phase: 'results', endsAt: at, winners, questions: {} }
}

function roundReveal(state: LiveState, at: number): LiveState {
  if (!state.round || state.round.revealedAt !== null) return state
  let s: LiveState = state
  // players who did not answer count as wrong
  for (const id of s.order) {
    const p = s.players[id]
    if (!p.connected || s.round!.answers[id]) continue
    s = gradeAnswer(s, id, s.round!.question, -1, at)
    s = { ...s, round: { ...s.round!, answers: { ...s.round!.answers, [id]: { choice: -1, at } } } }
  }
  return { ...s, round: { ...s.round!, revealedAt: at }, roundsPlayed: s.roundsPlayed + 1 }
}

function roundAdvance(state: LiveState, at: number): LiveState {
  if (!state.round) return state
  if (state.roundsPlayed >= state.config.maxQuestions || !state.cards.length) return endGame(state, at)
  return { ...state, round: makeRound(state, state.round.n + 1, at), feedback: {} }
}

/** Re-key a player record (used when a disconnected player rejoins from a new peer with the same name). */
function rekeyPlayer(state: LiveState, oldId: string, p: PlayerIdentity, at: number): LiveState {
  const old = state.players[oldId]
  const players = { ...state.players }
  delete players[oldId]
  players[p.id] = { ...old, id: p.id, name: p.name, avatar: p.avatar, connected: true, joinedAt: old.joinedAt || at }
  const questions = { ...state.questions }
  if (questions[oldId]) {
    questions[p.id] = { ...questions[oldId], id: questions[oldId].id.replace(oldId, p.id) }
    delete questions[oldId]
  }
  const asked = { ...state.asked }
  if (oldId in asked) {
    asked[p.id] = asked[oldId]
    delete asked[oldId]
  }
  const feedback = { ...state.feedback }
  if (feedback[oldId]) {
    feedback[p.id] = feedback[oldId]
    delete feedback[oldId]
  }
  const missedBy = { ...state.missedBy }
  if (missedBy[oldId]) {
    missedBy[p.id] = missedBy[oldId]
    delete missedBy[oldId]
  }
  const round = state.round
    ? { ...state.round, answers: Object.fromEntries(Object.entries(state.round.answers).map(([k, v]) => [k === oldId ? p.id : k, v])) }
    : null
  return {
    ...state,
    players,
    questions,
    asked,
    feedback,
    missedBy,
    round,
    order: state.order.map((id) => (id === oldId ? p.id : id)),
    winners: state.winners.map((id) => (id === oldId ? p.id : id)),
    answers: state.answers.map((a) => (a.playerId === oldId ? { ...a, playerId: p.id } : a)),
  }
}

// ---------- reducer ----------

export function reduce(state: LiveState, ev: LiveEvent): LiveState {
  switch (ev.type) {
    case 'configure':
      if (state.phase !== 'lobby') return state
      return { ...state, config: { ...state.config, ...ev.config } }

    case 'join': {
      const existing = state.players[ev.player.id]
      if (existing) {
        return {
          ...state,
          players: { ...state.players, [ev.player.id]: { ...existing, name: ev.player.name, avatar: ev.player.avatar, connected: true } },
        }
      }
      const sameName = state.order.find((id) => !state.players[id].connected && state.players[id].name.trim().toLowerCase() === ev.player.name.trim().toLowerCase())
      if (sameName) return rekeyPlayer(state, sameName, ev.player, ev.at)
      if (state.order.length >= MAX_PLAYERS) return state
      let s: LiveState = {
        ...state,
        players: { ...state.players, [ev.player.id]: newPlayer(ev.player, ev.at) },
        order: [...state.order, ev.player.id],
      }
      if (s.phase === 'playing') {
        // late joiner: give them a question / team right away
        if (s.config.teams && s.teams.length) {
          const counts = s.teams.map((t) => s.order.filter((id) => s.players[id].teamId === t.id).length)
          const smallest = counts.indexOf(Math.min(...counts))
          s = { ...s, players: { ...s.players, [ev.player.id]: { ...s.players[ev.player.id], teamId: s.teams[smallest].id } } }
        }
        if (s.config.mode === 'classic' || s.config.mode === 'blast') s = nextQuestionFor(s, ev.player.id, ev.at)
      }
      return s
    }

    case 'leave': {
      const p = state.players[ev.playerId]
      if (!p) return state
      if (state.phase === 'lobby') {
        const players = { ...state.players }
        delete players[ev.playerId]
        return { ...state, players, order: state.order.filter((id) => id !== ev.playerId) }
      }
      let s: LiveState = { ...state, players: { ...state.players, [ev.playerId]: { ...p, connected: false } } }
      if (s.phase === 'playing' && s.config.mode === 'study' && s.round && !s.round.revealedAt) s = maybeRevealRound(s, ev.at)
      return s
    }

    case 'kick': {
      if (!state.players[ev.playerId]) return state
      const players = { ...state.players }
      delete players[ev.playerId]
      const questions = { ...state.questions }
      delete questions[ev.playerId]
      return { ...state, players, questions, order: state.order.filter((id) => id !== ev.playerId) }
    }

    case 'start': {
      if (state.phase !== 'lobby' && state.phase !== 'results') return state
      if (!state.cards.length || !state.order.some((id) => state.players[id].connected)) return state
      return { ...state, phase: 'countdown', countdownEndsAt: ev.at + COUNTDOWN_MS }
    }

    case 'tick':
      return tick(state, ev.at)

    case 'answer': {
      if (state.phase !== 'playing') return state
      const p = state.players[ev.playerId]
      if (!p) return state
      if (state.config.mode === 'study') {
        const r = state.round
        if (!r || r.revealedAt !== null || r.question.id !== ev.questionId || r.answers[ev.playerId]) return state
        let s = gradeAnswer(state, ev.playerId, r.question, ev.choice, ev.at)
        s = { ...s, round: { ...s.round!, answers: { ...s.round!.answers, [ev.playerId]: { choice: ev.choice, at: ev.at } } } }
        return maybeRevealRound(s, ev.at)
      }
      const q = state.questions[ev.playerId]
      if (!q || q.id !== ev.questionId || p.finishedAt !== null) return state
      const s = gradeAnswer(state, ev.playerId, q, ev.choice, ev.at)
      return afterPersonalAnswer(s, ev.playerId, ev.at)
    }

    case 'power': {
      const p = state.players[ev.playerId]
      if (!p || state.phase !== 'playing') return state
      if (ev.kind === 'double' && p.powerUps.double === 'available') {
        return { ...state, players: { ...state.players, [ev.playerId]: { ...p, powerUps: { ...p.powerUps, double: 'armed' } } } }
      }
      return state
    }

    case 'match': {
      if (state.phase !== 'playing' || state.config.mode !== 'match') return state
      const p = state.players[ev.playerId]
      if (!p || p.finishedAt !== null) return state
      const pairs = state.board ? state.board.length / 2 : 0
      const matched = Math.max(p.progress, Math.min(ev.matched, pairs))
      const done = ev.done && matched >= pairs
      const elapsed = ev.at - (state.startedAt ?? ev.at)
      const next: LivePlayer = {
        ...p,
        progress: matched,
        correct: matched,
        score: matchPoints(matched, elapsed, done),
        finishedAt: done ? ev.at : null,
      }
      let s: LiveState = { ...state, players: { ...state.players, [ev.playerId]: next } }
      if (done) s = { ...s, winners: [...s.winners, ev.playerId] }
      return done ? finishIfNeeded(s, ev.at) : s
    }

    case 'nextRound': {
      if (state.phase !== 'playing' || state.config.mode !== 'study' || !state.round) return state
      return state.round.revealedAt === null ? roundReveal(state, ev.at) : roundAdvance(state, ev.at)
    }

    case 'end':
      if (state.phase === 'lobby') return state
      return endGame(state, ev.at)

    case 'reset': {
      const keep = state.order.filter((id) => state.players[id]?.connected)
      const players = resetScores(Object.fromEntries(keep.map((id) => [id, state.players[id]])))
      return { ...createState(state.cards, state.config, state.seed + 1), players, order: keep }
    }
  }
}

function maybeRevealRound(state: LiveState, at: number): LiveState {
  const r = state.round
  if (!r || r.revealedAt !== null) return state
  const expected = state.order.filter((id) => state.players[id].connected)
  const everyone = expected.every((id) => r.answers[id])
  return everyone ? roundReveal(state, at) : state
}

function tick(state: LiveState, at: number): LiveState {
  if (state.phase === 'countdown') {
    return state.countdownEndsAt !== null && at >= state.countdownEndsAt ? beginPlaying(state, at) : state
  }
  if (state.phase !== 'playing') return state
  let s = state
  if (s.config.mode === 'blast' && s.endsAt !== null && at >= s.endsAt) return endGame(s, at)
  if (s.config.mode === 'study' && s.round) {
    const r = s.round
    if (r.revealedAt === null && r.question.deadlineAt !== null && at >= r.question.deadlineAt) s = roundReveal(s, at)
    else if (r.revealedAt !== null && at >= r.revealedAt + REVEAL_MS) s = roundAdvance(s, at)
    return s
  }
  if (s.config.mode === 'classic' || s.config.mode === 'blast') {
    for (const id of s.order) {
      const q = s.questions[id]
      if (q && q.deadlineAt !== null && at >= q.deadlineAt && s.players[id].connected) {
        s = gradeAnswer(s, id, q, -1, at)
        s = afterPersonalAnswer(s, id, at)
        if (s.phase !== 'playing') return s
      }
    }
  }
  return s
}

// ---------- derived views ----------

function compareEntries(a: LivePlayer, b: LivePlayer, mode: LiveConfig['mode']): number {
  if (mode === 'match' || mode === 'classic') {
    if (a.finishedAt !== null && b.finishedAt !== null && a.finishedAt !== b.finishedAt) return a.finishedAt - b.finishedAt
    if ((a.finishedAt !== null) !== (b.finishedAt !== null)) return a.finishedAt !== null ? -1 : 1
    if (a.progress !== b.progress) return b.progress - a.progress
  }
  if (a.score !== b.score) return b.score - a.score
  if (a.progress !== b.progress) return b.progress - a.progress
  return a.name.localeCompare(b.name)
}

export function rankPlayers(state: LiveState): LeaderboardEntry[] {
  const sorted = state.order.map((id) => state.players[id]).filter(Boolean).sort((a, b) => compareEntries(a, b, state.config.mode))
  return sorted.map((p, i) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    teamId: p.teamId,
    score: p.score,
    progress: p.progress,
    streak: p.streak,
    connected: p.connected,
    finishedAt: p.finishedAt,
    rank: i + 1,
  }))
}

export function rankTeams(state: LiveState): TeamStanding[] {
  if (!state.teams.length) return []
  const standings = state.teams.map((team) => {
    const members = state.order.filter((id) => state.players[id].teamId === team.id)
    const score = members.reduce((acc, id) => acc + state.players[id].score, 0)
    const progress =
      state.config.mode === 'classic' || state.config.mode === 'match'
        ? Math.max(0, ...members.map((id) => state.players[id].progress))
        : members.reduce((acc, id) => acc + state.players[id].progress, 0)
    return { team, members, score, progress, rank: 0 }
  })
  standings.sort((a, b) => (b.progress !== a.progress ? b.progress - a.progress : b.score - a.score))
  return standings.map((s, i) => ({ ...s, rank: i + 1 }))
}

export function mostMissed(state: LiveState, limit = 10): MissedTerm[] {
  const byId = new Map(state.cards.map((c) => [c.id, c]))
  return Object.entries(state.missed)
    .map(([cardId, count]) => ({ ...(byId.get(cardId) ?? { id: cardId, term: '?', definition: '?' }), count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit)
}

function stripQuestion(q: HostQuestion): LiveQuestion {
  return { id: q.id, n: q.n, cardId: q.cardId, prompt: q.prompt, options: q.options, askedAt: q.askedAt, deadlineAt: q.deadlineAt }
}

function roundView(state: LiveState): RoundView | null {
  const r = state.round
  if (!r) return null
  const expected = state.order.filter((id) => state.players[id].connected).length
  const revealed = r.revealedAt !== null
  const distribution = revealed ? r.question.options.map((_, i) => Object.values(r.answers).filter((a) => a.choice === i).length) : null
  return {
    n: r.n,
    total: state.config.maxQuestions,
    question: stripQuestion(r.question),
    answered: Object.keys(r.answers).length,
    expected,
    reveal: revealed ? r.question.correctIndex : null,
    distribution,
  }
}

export function publicState(state: LiveState, now: number): PublicState {
  return {
    phase: state.phase,
    config: state.config,
    now,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    countdownEndsAt: state.countdownEndsAt,
    players: rankPlayers(state),
    teams: rankTeams(state),
    round: roundView(state),
    winners: state.winners,
    missed: state.phase === 'results' ? mostMissed(state) : [],
    cardCount: state.cards.length,
  }
}

/** Snapshot for one player: everything they need, nothing they should not see (no correct indices). */
export function playerView(state: LiveState, playerId: string, now: number): PlayerView {
  const me = state.players[playerId] ?? null
  const leaderboard = rankPlayers(state)
  const rank = leaderboard.find((e) => e.id === playerId)?.rank ?? 0
  const q = state.questions[playerId]
  const r = roundView(state)
  const byId = new Map(state.cards.map((c) => [c.id, c]))
  const missedMine =
    state.phase === 'results'
      ? [...new Set(state.missedBy[playerId] ?? [])].map((id) => byId.get(id)).filter((c): c is LiveCard => Boolean(c))
      : []
  return {
    phase: state.phase,
    config: state.config,
    now,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    countdownEndsAt: state.countdownEndsAt,
    me,
    rank,
    team: me?.teamId ? (state.teams.find((t) => t.id === me.teamId) ?? null) : null,
    leaderboard,
    teams: rankTeams(state),
    question: state.phase === 'playing' && q && me?.finishedAt === null ? stripQuestion(q) : null,
    feedback: state.feedback[playerId] ?? null,
    board: state.phase === 'playing' && state.config.mode === 'match' ? state.board : null,
    round: r ? { ...r, myChoice: state.round?.answers[playerId]?.choice ?? null } : null,
    winners: state.winners,
    missedMine,
    cardCount: state.cards.length,
  }
}

/** Downloadable results summary. */
export function resultsExport(state: LiveState, meta: { setTitle: string; code: string }) {
  return {
    format: 'myquizz-live-results',
    version: 1,
    set: meta.setTitle,
    code: meta.code,
    mode: state.config.mode,
    config: state.config,
    startedAt: state.startedAt,
    endedAt: state.endsAt,
    players: rankPlayers(state).map((e) => ({ rank: e.rank, name: e.name, avatar: e.avatar, team: e.teamId, score: e.score, progress: e.progress })),
    teams: rankTeams(state).map((t) => ({ rank: t.rank, name: t.team.name, score: t.score, progress: t.progress })),
    mostMissed: mostMissed(state, 50),
    answers: state.answers.map((a) => ({ ...a, player: state.players[a.playerId]?.name ?? a.playerId })),
  }
}
