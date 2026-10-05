import { describe, expect, it } from 'vitest'
import { COUNTDOWN_MS, REVEAL_MS, type LiveCard, type LiveConfig } from './protocol'
import { assignTeams, buildBoard, createState, mostMissed, playerView, publicState, rankTeams, reduce, type HostQuestion, type LiveState } from './engine'

const cards: LiveCard[] = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, term: `term${i}`, definition: `def${i}` }))

const T0 = 1_000_000
const ids = ['p1', 'p2', 'p3']

function lobby(config: Partial<LiveConfig> = {}, players = ids): LiveState {
  let s = createState(cards, config, 7)
  players.forEach((id, i) => {
    s = reduce(s, { type: 'join', player: { id, name: `Player ${i + 1}`, avatar: '🦊' }, at: T0 + i })
  })
  return s
}

function started(config: Partial<LiveConfig> = {}, players = ids): LiveState {
  let s = lobby(config, players)
  s = reduce(s, { type: 'start', at: T0 })
  expect(s.phase).toBe('countdown')
  s = reduce(s, { type: 'tick', at: T0 + COUNTDOWN_MS })
  expect(s.phase).toBe('playing')
  return s
}

function answer(s: LiveState, playerId: string, correct: boolean, at: number): LiveState {
  const q: HostQuestion = s.questions[playerId]
  expect(q).toBeDefined()
  const choice = correct ? q.correctIndex : (q.correctIndex + 1) % q.options.length
  return reduce(s, { type: 'answer', playerId, questionId: q.id, choice, at })
}

describe('live engine: lobby', () => {
  it('joins, configures, leaves and refuses to start without players', () => {
    let s = createState(cards)
    expect(reduce(s, { type: 'start', at: T0 }).phase).toBe('lobby')
    s = reduce(s, { type: 'configure', config: { mode: 'blast', teams: true } })
    expect(s.config.mode).toBe('blast')
    s = reduce(s, { type: 'join', player: { id: 'a', name: 'Ann', avatar: '🐸' }, at: T0 })
    s = reduce(s, { type: 'join', player: { id: 'a', name: 'Ann B', avatar: '🐸' }, at: T0 })
    expect(s.order).toEqual(['a'])
    expect(s.players.a.name).toBe('Ann B')
    s = reduce(s, { type: 'leave', playerId: 'a', at: T0 })
    expect(s.order).toEqual([])
  })
  it('does not reconfigure after start', () => {
    const s = started()
    expect(reduce(s, { type: 'configure', config: { mode: 'match' } }).config.mode).toBe('classic')
  })
})

describe('live engine: classic', () => {
  it('builds valid questions with the correct answer among options', () => {
    const s = started({ maxQuestions: 3 })
    for (const id of ids) {
      const q = s.questions[id]
      expect(q.options.length).toBe(4)
      expect(q.options[q.correctIndex]).toBe(q.expected)
      expect(new Set(q.options).size).toBe(4)
      expect(q.deadlineAt).toBe(T0 + COUNTDOWN_MS + 20_000)
    }
  })
  it('awards speed points + streak bonus, resets progress on a wrong answer', () => {
    let s = started({ maxQuestions: 5 })
    const t = T0 + COUNTDOWN_MS
    s = answer(s, 'p1', true, t) // full speed: 1000
    expect(s.players.p1.score).toBe(1000)
    expect(s.players.p1.progress).toBe(1)
    s = answer(s, 'p1', true, t + 10_000) // half time: 500 + streak 100
    expect(s.players.p1.score).toBe(1600)
    expect(s.players.p1.streak).toBe(2)
    expect(s.players.p1.progress).toBe(2)
    s = answer(s, 'p1', false, t + 10_000) // saver absorbs the first miss
    expect(s.players.p1.powerUps.saver).toBe('used')
    expect(s.players.p1.progress).toBe(2)
    expect(s.feedback.p1.usedSaver).toBe(true)
    s = answer(s, 'p1', false, t + 10_000)
    expect(s.players.p1.progress).toBe(0)
    expect(s.players.p1.streak).toBe(0)
    expect(s.players.p1.score).toBe(1600)
    expect(s.missed[s.answers.at(-1)!.cardId]).toBe(1)
  })
  it('fast mode keeps progress on wrong answers', () => {
    let s = started({ maxQuestions: 5, fastMode: true })
    const t = T0 + COUNTDOWN_MS
    s = answer(s, 'p1', true, t)
    s = answer(s, 'p1', false, t)
    s = answer(s, 'p1', false, t)
    expect(s.players.p1.progress).toBe(1)
  })
  it('double points power-up doubles the next correct answer once', () => {
    let s = started({ maxQuestions: 5 })
    const t = T0 + COUNTDOWN_MS
    s = reduce(s, { type: 'power', playerId: 'p1', kind: 'double', at: t })
    expect(s.players.p1.powerUps.double).toBe('armed')
    s = answer(s, 'p1', true, t)
    expect(s.players.p1.score).toBe(2000)
    expect(s.players.p1.powerUps.double).toBe('used')
    s = reduce(s, { type: 'power', playerId: 'p1', kind: 'double', at: t })
    expect(s.players.p1.powerUps.double).toBe('used')
    s = answer(s, 'p1', true, t)
    expect(s.players.p1.score).toBe(2000 + 1100)
  })
  it('ends when the first player reaches the target and ranks finishers first', () => {
    let s = started({ maxQuestions: 2 })
    const t = T0 + COUNTDOWN_MS
    s = answer(s, 'p2', true, t)
    s = answer(s, 'p1', true, t)
    s = answer(s, 'p2', true, t + 1000)
    expect(s.phase).toBe('results')
    expect(s.winners).toEqual(['p2'])
    const pub = publicState(s, t + 1000)
    expect(pub.players[0].id).toBe('p2')
    expect(pub.players[0].rank).toBe(1)
  })
  it('times out unanswered questions on tick', () => {
    let s = started({ maxQuestions: 5, timePerQuestion: 10 })
    const t = T0 + COUNTDOWN_MS
    const first = s.questions.p1.id
    s = reduce(s, { type: 'tick', at: t + 5000 })
    expect(s.questions.p1.id).toBe(first)
    s = reduce(s, { type: 'tick', at: t + 10_000 })
    expect(s.questions.p1.id).not.toBe(first)
    expect(s.players.p1.wrong).toBe(1)
    expect(s.feedback.p1.given).toBeNull()
  })
  it('cycles through all cards before repeating one', () => {
    let s = started({ maxQuestions: 100, timePerQuestion: 0 })
    const seen: string[] = []
    for (let i = 0; i < cards.length; i++) {
      seen.push(s.questions.p1.cardId)
      s = answer(s, 'p1', true, T0 + COUNTDOWN_MS + i)
    }
    expect(new Set(seen).size).toBe(cards.length)
  })
})

describe('live engine: teams', () => {
  it('assigns connected players round-robin to mascot teams and aggregates standings', () => {
    let s = started({ teams: true, teamCount: 2, mascotTheme: 'food', maxQuestions: 3 }, ['a', 'b', 'c', 'd'])
    expect(s.teams.length).toBe(2)
    expect(s.teams.map((t) => t.emoji)).toEqual(['🍕', '🥑'])
    const byTeam = s.teams.map((t) => s.order.filter((id) => s.players[id].teamId === t.id).length)
    expect(byTeam).toEqual([2, 2])
    const t = T0 + COUNTDOWN_MS
    s = answer(s, 'a', true, t)
    s = answer(s, 'a', true, t)
    const teams = rankTeams(s)
    const teamA = teams.find((x) => x.members.includes('a'))!
    expect(teamA.rank).toBe(1)
    expect(teamA.score).toBe(2100)
    expect(teamA.progress).toBe(2) // classic: best member progress
  })
  it('late joiners land on the smallest team and get a question', () => {
    let s = started({ teams: true, teamCount: 2, maxQuestions: 3 }, ['a', 'b', 'c'])
    s = reduce(s, { type: 'join', player: { id: 'late', name: 'Late', avatar: '🐢' }, at: T0 + 9000 })
    const counts = s.teams.map((t) => s.order.filter((id) => s.players[id].teamId === t.id).length)
    expect(counts).toEqual([2, 2])
    expect(s.questions.late).toBeDefined()
    const view = playerView(s, 'late', T0 + 9000)
    expect(view.phase).toBe('playing')
    expect(view.question?.options.length).toBe(4)
    expect(view.team).not.toBeNull()
    expect('correctIndex' in (view.question ?? {})).toBe(false)
  })
  it('assignTeams clamps team count to available mascots', () => {
    const s = assignTeams({ ...lobby({ teams: true, teamCount: 50 }, ['a', 'b', 'c', 'd', 'e']), config: { ...lobby().config, teams: true, teamCount: 50 } })
    expect(s.teams.length).toBe(5)
  })
})

describe('live engine: blast', () => {
  it('runs for the configured time, then ranks by score', () => {
    let s = started({ mode: 'blast', blastSeconds: 90, maxQuestions: 0, timePerQuestion: 0 })
    const t = T0 + COUNTDOWN_MS
    expect(s.endsAt).toBe(t + 90_000)
    s = answer(s, 'p1', true, t)
    s = answer(s, 'p1', true, t)
    s = answer(s, 'p2', false, t)
    expect(s.players.p1.progress).toBe(2)
    expect(s.players.p2.progress).toBe(1)
    s = reduce(s, { type: 'tick', at: t + 89_999 })
    expect(s.phase).toBe('playing')
    s = reduce(s, { type: 'tick', at: t + 90_000 })
    expect(s.phase).toBe('results')
    expect(s.winners).toEqual(['p1'])
    expect(publicState(s, t + 90_000).missed.length).toBe(1)
  })
  it('ignores answers to stale questions', () => {
    let s = started({ mode: 'blast' })
    const t = T0 + COUNTDOWN_MS
    const stale = s.questions.p1.id
    s = answer(s, 'p1', true, t)
    const before = s.players.p1.score
    s = reduce(s, { type: 'answer', playerId: 'p1', questionId: stale, choice: 0, at: t })
    expect(s.players.p1.score).toBe(before)
  })
})

describe('live engine: match', () => {
  it('builds a shuffled board of pairs', () => {
    const board = buildBoard(cards, 6, 3)
    expect(board.length).toBe(12)
    expect(new Set(board.map((b) => b.pairId)).size).toBe(6)
    expect(board.map((b) => b.id)).toEqual([...Array(12).keys()])
    expect(buildBoard(cards.slice(0, 2), 6, 3).length).toBe(4)
  })
  it('tracks progress, finishes the fastest player first', () => {
    let s = started({ mode: 'match', matchPairs: 6, winners: 1 })
    const t = T0 + COUNTDOWN_MS
    expect(s.board?.length).toBe(12)
    s = reduce(s, { type: 'match', playerId: 'p1', matched: 3, done: false, at: t + 5000 })
    expect(s.players.p1.progress).toBe(3)
    expect(s.players.p1.score).toBe(300)
    s = reduce(s, { type: 'match', playerId: 'p2', matched: 99, done: true, at: t + 8000 })
    expect(s.players.p2.progress).toBe(6)
    expect(s.players.p2.finishedAt).toBe(t + 8000)
    expect(s.phase).toBe('results')
    expect(s.winners).toEqual(['p2'])
    expect(publicState(s, t + 8000).players[0].id).toBe('p2')
  })
  it('with two winners waits for the second finisher', () => {
    let s = started({ mode: 'match', winners: 2 })
    const t = T0 + COUNTDOWN_MS
    s = reduce(s, { type: 'match', playerId: 'p1', matched: 6, done: true, at: t + 1 })
    expect(s.phase).toBe('playing')
    s = reduce(s, { type: 'match', playerId: 'p3', matched: 6, done: true, at: t + 2 })
    expect(s.phase).toBe('results')
    expect(s.winners).toEqual(['p1', 'p3'])
  })
})

describe('live engine: study with friends', () => {
  it('shares one question, reveals when everyone answered, then advances', () => {
    let s = started({ mode: 'study', maxQuestions: 2, timePerQuestion: 30 })
    const t = T0 + COUNTDOWN_MS
    const r = s.round!
    expect(r.n).toBe(0)
    const v = playerView(s, 'p1', t)
    expect(v.round?.question.id).toBe('r0')
    expect(v.round?.reveal).toBeNull()
    s = reduce(s, { type: 'answer', playerId: 'p1', questionId: 'r0', choice: r.question.correctIndex, at: t + 1000 })
    s = reduce(s, { type: 'answer', playerId: 'p1', questionId: 'r0', choice: 0, at: t + 1000 }) // duplicate ignored
    expect(s.round?.revealedAt).toBeNull()
    expect(playerView(s, 'p1', t).round?.myChoice).toBe(r.question.correctIndex)
    s = reduce(s, { type: 'answer', playerId: 'p2', questionId: 'r0', choice: (r.question.correctIndex + 1) % 4, at: t + 2000 })
    s = reduce(s, { type: 'answer', playerId: 'p3', questionId: 'r0', choice: (r.question.correctIndex + 1) % 4, at: t + 3000 })
    expect(s.round?.revealedAt).toBe(t + 3000)
    const pub = publicState(s, t + 3000)
    expect(pub.round?.reveal).toBe(r.question.correctIndex)
    expect(pub.round?.distribution?.reduce((a, b) => a + b, 0)).toBe(3)
    expect(s.players.p1.score).toBeGreaterThan(0)
    expect(s.players.p2.score).toBe(0)
    // nothing happens before the reveal time has passed
    s = reduce(s, { type: 'tick', at: t + 3000 + REVEAL_MS - 1 })
    expect(s.round?.n).toBe(0)
    s = reduce(s, { type: 'tick', at: t + 3000 + REVEAL_MS })
    expect(s.round?.n).toBe(1)
    expect(s.round?.revealedAt).toBeNull()
  })
  it('reveals on deadline, counts silent players as wrong and ends after max questions', () => {
    let s = started({ mode: 'study', maxQuestions: 1, timePerQuestion: 10 })
    const t = T0 + COUNTDOWN_MS
    s = reduce(s, { type: 'tick', at: t + 10_000 })
    expect(s.round?.revealedAt).toBe(t + 10_000)
    expect(s.players.p1.wrong).toBe(1)
    s = reduce(s, { type: 'tick', at: t + 10_000 + REVEAL_MS })
    expect(s.phase).toBe('results')
    const missed = mostMissed(s)
    expect(missed.length).toBe(1)
    expect(missed[0].count).toBe(3)
    expect(playerView(s, 'p2', t).missedMine.map((c) => c.id)).toEqual([missed[0].id])
  })
  it('host can skip ahead with nextRound and a leaving player no longer blocks the reveal', () => {
    let s = started({ mode: 'study', maxQuestions: 3, timePerQuestion: 0 })
    const t = T0 + COUNTDOWN_MS
    const q = s.round!.question
    s = reduce(s, { type: 'answer', playerId: 'p1', questionId: q.id, choice: q.correctIndex, at: t })
    s = reduce(s, { type: 'answer', playerId: 'p2', questionId: q.id, choice: q.correctIndex, at: t })
    s = reduce(s, { type: 'leave', playerId: 'p3', at: t + 1 })
    expect(s.round?.revealedAt).toBe(t + 1)
    s = reduce(s, { type: 'nextRound', at: t + 2 })
    expect(s.round?.n).toBe(1)
    s = reduce(s, { type: 'nextRound', at: t + 3 }) // reveal early
    expect(s.round?.revealedAt).toBe(t + 3)
    expect(s.players.p1.wrong).toBe(1)
  })
})

describe('live engine: connections', () => {
  it('keeps score on disconnect and lets the player rejoin by name from a new peer id', () => {
    let s = started({ maxQuestions: 5 })
    const t = T0 + COUNTDOWN_MS
    s = answer(s, 'p1', true, t)
    s = reduce(s, { type: 'leave', playerId: 'p1', at: t })
    expect(s.players.p1.connected).toBe(false)
    expect(s.players.p1.score).toBe(1000)
    s = reduce(s, { type: 'join', player: { id: 'p1b', name: 'player 1', avatar: '🐸' }, at: t + 5 })
    expect(s.players.p1).toBeUndefined()
    expect(s.players.p1b.score).toBe(1000)
    expect(s.players.p1b.connected).toBe(true)
    expect(s.order).toEqual(['p1b', 'p2', 'p3'])
    expect(s.questions.p1b.id).toBe('p1b:1')
    const v = playerView(s, 'p1b', t + 5)
    expect(v.me?.score).toBe(1000)
    expect(v.question?.id).toBe('p1b:1')
  })
  it('rejoin with the same id just reconnects', () => {
    let s = started()
    s = reduce(s, { type: 'leave', playerId: 'p2', at: T0 })
    s = reduce(s, { type: 'join', player: { id: 'p2', name: 'Player 2', avatar: '🦊' }, at: T0 })
    expect(s.players.p2.connected).toBe(true)
    expect(s.order.length).toBe(3)
  })
  it('kick removes a player, end stops the game, reset returns to the lobby keeping connected players', () => {
    let s = started({ maxQuestions: 5 })
    s = reduce(s, { type: 'kick', playerId: 'p3' })
    expect(s.order).toEqual(['p1', 'p2'])
    s = answer(s, 'p1', true, T0 + COUNTDOWN_MS)
    s = reduce(s, { type: 'leave', playerId: 'p2', at: T0 })
    s = reduce(s, { type: 'end', at: T0 + 50_000 })
    expect(s.phase).toBe('results')
    expect(s.winners).toEqual(['p1'])
    s = reduce(s, { type: 'reset' })
    expect(s.phase).toBe('lobby')
    expect(s.order).toEqual(['p1'])
    expect(s.players.p1.score).toBe(0)
    expect(s.config.maxQuestions).toBe(5)
  })
  it('late-join snapshot in the lobby and results phases', () => {
    let s = lobby()
    const v = playerView(s, 'p2', T0)
    expect(v.phase).toBe('lobby')
    expect(v.leaderboard.length).toBe(3)
    expect(v.question).toBeNull()
    expect(playerView(s, 'ghost', T0).me).toBeNull()
    s = started({ maxQuestions: 1 })
    s = answer(s, 'p1', true, T0 + COUNTDOWN_MS)
    const res = playerView(s, 'p2', T0)
    expect(res.phase).toBe('results')
    expect(res.winners).toEqual(['p1'])
    expect(res.rank).toBeGreaterThan(1)
  })
})
