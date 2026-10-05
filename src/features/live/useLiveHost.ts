/**
 * Host-side game controller: runs the authoritative engine, talks to players over the room,
 * handles late joiners / reconnects, timers and the host's own session record.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { finishSession, getCards, recordOutcome, startSession } from '@/db/repo'
import { encodeSet } from '@/domain/share-codec'
import { plainText } from '@/domain/text'
import { newId } from '@/domain/id'
import type { Card, Session, SessionAnswer, StudySet } from '@/domain/types'
import { createState, playerView, publicState, reduce, resultsExport, type LiveEvent, type LiveState } from '@/domain/live/engine'
import {
  generateCode,
  isClientMessage,
  type HostMessage,
  type LiveCard,
  type LiveConfig,
  type PlayerIdentity,
  type PlayerView,
  type PublicState,
} from '@/domain/live/protocol'
import { useSettings } from '@/app/settings-store'
import { useLiveRoom, type UseLiveRoom } from './useLiveRoom'
import { loadHostCode, saveHostCode } from './storage'

export interface UseLiveHost {
  set: StudySet | null | undefined
  cards: Card[] | undefined
  code: string
  room: UseLiveRoom
  state: LiveState
  view: PublicState
  /** The host's own player view when "play along" is on. */
  myView: PlayerView | null
  myId: string
  dispatch: (ev: LiveEvent) => void
  configure: (patch: Partial<LiveConfig>) => void
  start: () => void
  end: () => void
  nextRound: () => void
  kick: (playerId: string) => void
  reset: () => void
  newCode: () => void
  answer: (questionId: string, choice: number) => void
  power: (kind: 'double' | 'saver') => void
  match: (matched: number, done: boolean) => void
  exportResults: () => void
  elapsedMs: number
}

function toLiveCards(cards: Card[]): LiveCard[] {
  return cards
    .filter((c) => !c.suspended && c.term.trim() && c.definition.trim())
    .map((c) => ({ id: c.id, term: plainText(c.term), definition: plainText(c.definition) }))
}

export function useLiveHost(setId: string): UseLiveHost {
  const settings = useSettings((s) => s.settings)
  const set = useLiveQuery(() => db.sets.get(setId), [setId])
  const cards = useLiveQuery(() => getCards(setId), [setId])
  const [code, setCode] = useState(() => loadHostCode(setId) ?? generateCode())
  const [state, setState] = useState<LiveState>(() => createState([], {}, Date.now() & 0xffff))
  const stateRef = useRef(state)
  const peerToPlayer = useRef(new Map<string, string>())
  const lastSent = useRef(new Map<string, string>())
  const sessionRef = useRef<Session | null>(null)
  const myId = useMemo(() => `host-${newId(6)}`, [])
  const [elapsedMs, setElapsed] = useState(0)

  useEffect(() => saveHostCode(setId, code), [setId, code])

  const liveCards = useMemo(() => (cards ? toLiveCards(cards) : []), [cards])
  const setCode_ = useMemo(() => (set && cards ? encodeSet(set, cards.filter((c) => !c.suspended)) : ''), [set, cards])

  // Keep cards in the engine up to date while in the lobby.
  useEffect(() => {
    if (stateRef.current.phase !== 'lobby') return
    const next = { ...stateRef.current, cards: liveCards }
    stateRef.current = next
    setState(next)
  }, [liveCards])

  const roomRef = useRef<UseLiveRoom | null>(null)

  const sendTo = useCallback((peerId: string, msg: HostMessage) => {
    void roomRef.current?.send(msg, peerId)
  }, [])

  /** Push each connected player their (changed) view. */
  const broadcast = useCallback(
    (s: LiveState) => {
      const now = Date.now()
      for (const [peerId, playerId] of peerToPlayer.current) {
        if (!s.players[playerId]) continue
        const view = playerView(s, playerId, now)
        const key = JSON.stringify({ ...view, now: 0 })
        if (lastSent.current.get(peerId) === key) continue
        lastSent.current.set(peerId, key)
        sendTo(peerId, { v: 1, t: 'view', view })
      }
    },
    [sendTo],
  )

  const dispatch = useCallback(
    (ev: LiveEvent) => {
      const prev = stateRef.current
      const next = reduce(prev, ev)
      if (next === prev) return
      stateRef.current = next
      setState(next)
      broadcast(next)
      // host bookkeeping on phase changes
      if (prev.phase !== 'playing' && next.phase === 'playing') {
        void startSession(setId, 'live', { code, config: next.config, players: next.order.length }).then((s) => {
          sessionRef.current = s
        })
      }
      if (prev.phase !== 'results' && next.phase === 'results') {
        const s = sessionRef.current
        if (s) {
          const mine = next.answers.filter((a) => a.playerId === myId)
          const answers: SessionAnswer[] = mine.map((a) => ({
            cardId: a.cardId,
            questionType: 'multipleChoice',
            prompt: a.prompt,
            given: a.given,
            expected: a.expected,
            correct: a.correct,
            durationMs: a.durationMs,
          }))
          const me = next.players[myId]
          void finishSession(s, {
            answers,
            score: me ? me.score : next.winners.length,
            total: next.order.length,
            settings: { ...s.settings, winners: next.winners.map((id) => next.players[id]?.name ?? id), mostMissed: publicState(next, Date.now()).missed },
          })
          sessionRef.current = null
        }
      }
      // the host's own answers count towards their progress
      if (ev.type === 'answer' && ev.playerId === myId && next.answers.length > prev.answers.length) {
        const a = next.answers[next.answers.length - 1]
        const card = cards?.find((c) => c.id === a.cardId)
        if (card) void recordOutcome(card, a.correct, 'live', 'forward', a.durationMs)
      }
    },
    [broadcast, setId, code, myId, cards],
  )

  const onMessage = useCallback(
    (raw: unknown, peerId: string) => {
      if (!isClientMessage(raw)) return
      const s = stateRef.current
      switch (raw.t) {
        case 'hello': {
          const p: PlayerIdentity = {
            id: String(raw.player.id).slice(0, 40) || peerId,
            name: String(raw.player.name).slice(0, 24).trim() || 'Player',
            avatar: String(raw.player.avatar).slice(0, 8) || '🙂',
          }
          // One player per peer; a player id reused from another peer takes over that identity.
          for (const [otherPeer, pid] of peerToPlayer.current) if (pid === p.id && otherPeer !== peerId) peerToPlayer.current.delete(otherPeer)
          peerToPlayer.current.set(peerId, p.id)
          const before = stateRef.current
          dispatch({ type: 'join', player: p, at: Date.now() })
          const after = stateRef.current
          if (after === before && !before.players[p.id]) {
            sendTo(peerId, { v: 1, t: 'end', reason: 'full' })
            peerToPlayer.current.delete(peerId)
            return
          }
          // rekeyed by name → the engine chose a different id; find it
          const pid = after.players[p.id] ? p.id : (after.order.find((id) => after.players[id].name.toLowerCase() === p.name.toLowerCase()) ?? p.id)
          peerToPlayer.current.set(peerId, pid)
          const view = playerView(after, pid, Date.now())
          lastSent.current.set(peerId, JSON.stringify({ ...view, now: 0 }))
          sendTo(peerId, { v: 1, t: 'welcome', set: setCode_, title: set?.title ?? '', view })
          break
        }
        case 'answer': {
          const pid = peerToPlayer.current.get(peerId)
          if (pid) dispatch({ type: 'answer', playerId: pid, questionId: String(raw.questionId), choice: Number(raw.choice), at: Date.now() })
          break
        }
        case 'power': {
          const pid = peerToPlayer.current.get(peerId)
          if (pid && (raw.kind === 'double' || raw.kind === 'saver')) dispatch({ type: 'power', playerId: pid, kind: raw.kind, at: Date.now() })
          break
        }
        case 'match': {
          const pid = peerToPlayer.current.get(peerId)
          if (pid) dispatch({ type: 'match', playerId: pid, matched: Number(raw.matched) || 0, done: Boolean(raw.done), at: Date.now() })
          break
        }
        case 'bye': {
          const pid = peerToPlayer.current.get(peerId)
          peerToPlayer.current.delete(peerId)
          lastSent.current.delete(peerId)
          if (pid) dispatch({ type: 'leave', playerId: pid, at: Date.now() })
          break
        }
      }
      void s
    },
    [dispatch, sendTo, setCode_, set?.title],
  )

  const onPeerLeave = useCallback(
    (peerId: string) => {
      const pid = peerToPlayer.current.get(peerId)
      peerToPlayer.current.delete(peerId)
      lastSent.current.delete(peerId)
      if (pid) dispatch({ type: 'leave', playerId: pid, at: Date.now() })
    },
    [dispatch],
  )

  const room = useLiveRoom({ code, onMessage, onPeerLeave })
  roomRef.current = room

  // Timers: engine ticks while counting down / playing.
  useEffect(() => {
    if (state.phase !== 'countdown' && state.phase !== 'playing') return
    const id = setInterval(() => {
      dispatch({ type: 'tick', at: Date.now() })
      setElapsed(Date.now() - (stateRef.current.startedAt ?? Date.now()))
    }, 250)
    return () => clearInterval(id)
  }, [state.phase, dispatch])

  // Host plays along: join/leave the game as a local player.
  useEffect(() => {
    if (state.phase !== 'lobby') return
    const present = Boolean(stateRef.current.players[myId])
    if (state.config.hostPlays && !present) {
      dispatch({ type: 'join', player: { id: myId, name: settings.displayName.trim() || 'Host', avatar: settings.avatar || '🦊' }, at: Date.now() })
    } else if (!state.config.hostPlays && present) {
      dispatch({ type: 'kick', playerId: myId })
    }
  }, [state.config.hostPlays, state.phase, myId, dispatch, settings.displayName, settings.avatar])

  // Tell players when the host leaves.
  useEffect(() => {
    return () => {
      const r = roomRef.current
      if (r && peerToPlayer.current.size) void r.send({ v: 1, t: 'end', reason: 'hostLeft' } satisfies HostMessage)
    }
  }, [])

  const now = Date.now()
  const view = useMemo(() => publicState(state, now), [state, now])
  const myView = state.config.hostPlays && state.players[myId] ? playerView(state, myId, now) : null

  const exportResults = useCallback(() => {
    const data = resultsExport(stateRef.current, { setTitle: set?.title ?? '', code })
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `myquizz-live-${code}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }, [set?.title, code])

  return {
    set,
    cards,
    code,
    room,
    state,
    view,
    myView,
    myId,
    dispatch,
    configure: (patch) => dispatch({ type: 'configure', config: patch }),
    start: () => dispatch({ type: 'start', at: Date.now() }),
    end: () => dispatch({ type: 'end', at: Date.now() }),
    nextRound: () => dispatch({ type: 'nextRound', at: Date.now() }),
    kick: (playerId) => {
      for (const [peerId, pid] of peerToPlayer.current) {
        if (pid === playerId) {
          sendTo(peerId, { v: 1, t: 'end', reason: 'kicked' })
          peerToPlayer.current.delete(peerId)
        }
      }
      dispatch({ type: 'kick', playerId })
    },
    reset: () => dispatch({ type: 'reset' }),
    newCode: () => {
      peerToPlayer.current.clear()
      lastSent.current.clear()
      setCode(generateCode())
    },
    answer: (questionId, choice) => dispatch({ type: 'answer', playerId: myId, questionId, choice, at: Date.now() }),
    power: (kind) => dispatch({ type: 'power', playerId: myId, kind, at: Date.now() }),
    match: (matched, done) => dispatch({ type: 'match', playerId: myId, matched, done, at: Date.now() }),
    exportResults,
    elapsedMs,
  }
}
