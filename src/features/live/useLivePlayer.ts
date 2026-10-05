/** Player-side controller: finds the host in the room, keeps the latest view and sends answers. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isHostMessage, type ClientMessage, type HostMessage, type PlayerIdentity, type PlayerView, type PowerUpKind } from '@/domain/live/protocol'
import { useLiveRoom, type UseLiveRoom } from './useLiveRoom'

export type PlayerStatus = 'idle' | 'connecting' | 'connected' | 'ended' | 'timeout'
export const JOIN_TIMEOUT_MS = 15_000

export interface UseLivePlayer {
  status: PlayerStatus
  endReason: Extract<HostMessage, { t: 'end' }>['reason'] | null
  room: UseLiveRoom
  view: PlayerView | null
  setCode: string | null
  setTitle: string
  /** host clock minus local clock */
  clockOffset: number
  answer: (questionId: string, choice: number) => void
  power: (kind: PowerUpKind) => void
  match: (matched: number, done: boolean) => void
  retry: () => void
}

export function useLivePlayer(code: string | null, identity: PlayerIdentity | null): UseLivePlayer {
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [endReason, setEndReason] = useState<UseLivePlayer['endReason']>(null)
  const [view, setView] = useState<PlayerView | null>(null)
  const [setCode, setSetCode] = useState<string | null>(null)
  const [setTitle, setSetTitle] = useState('')
  const [clockOffset, setClockOffset] = useState(0)
  const hostPeer = useRef<string | null>(null)
  const identityRef = useRef(identity)
  identityRef.current = identity
  const roomRef = useRef<UseLiveRoom | null>(null)

  const hello = useCallback((target?: string) => {
    const id = identityRef.current
    if (!id) return
    const msg: ClientMessage = { v: 1, t: 'hello', player: id }
    void roomRef.current?.send(msg, target)
  }, [])

  const onMessage = useCallback((raw: unknown, peerId: string) => {
    if (!isHostMessage(raw)) return
    switch (raw.t) {
      case 'welcome':
        hostPeer.current = peerId
        setSetCode(raw.set || null)
        setSetTitle(raw.title)
        setView(raw.view)
        setClockOffset(raw.view.now - Date.now())
        setStatus('connected')
        break
      case 'view':
        if (hostPeer.current && peerId !== hostPeer.current) return
        hostPeer.current = peerId
        setView(raw.view)
        setClockOffset(raw.view.now - Date.now())
        setStatus('connected')
        break
      case 'end':
        if (hostPeer.current && peerId !== hostPeer.current) return
        setEndReason(raw.reason)
        setStatus('ended')
        break
    }
  }, [])

  // Every new peer might be the host; non-hosts ignore hello messages.
  const onPeerJoin = useCallback((peerId: string) => hello(peerId), [hello])
  const onPeerLeave = useCallback((peerId: string) => {
    if (peerId !== hostPeer.current) return
    hostPeer.current = null
    setStatus((s) => (s === 'connected' ? 'ended' : s))
    setEndReason((r) => r ?? 'hostLeft')
  }, [])

  const active = Boolean(code && identity)
  const room = useLiveRoom({ code: active ? code : null, onMessage, onPeerJoin, onPeerLeave })
  roomRef.current = room

  // (Re)announce ourselves once the room is open, and after a reconnect.
  useEffect(() => {
    if (!active || room.status !== 'open') return
    setStatus((s) => (s === 'connected' ? s : 'connecting'))
    hostPeer.current = null
    hello()
    const retry = setInterval(() => {
      if (!hostPeer.current) hello()
    }, 3000)
    return () => clearInterval(retry)
  }, [active, room.status, hello])

  // Join timeout → let the UI offer fallbacks.
  useEffect(() => {
    if (status !== 'connecting') return
    const t = setTimeout(() => setStatus((s) => (s === 'connecting' ? 'timeout' : s)), JOIN_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [status])

  // Say goodbye when leaving the page.
  useEffect(() => {
    return () => {
      const r = roomRef.current
      if (r && hostPeer.current) void r.send({ v: 1, t: 'bye' } satisfies ClientMessage, hostPeer.current)
    }
  }, [])

  const sendHost = useCallback((msg: ClientMessage) => {
    if (hostPeer.current) void roomRef.current?.send(msg, hostPeer.current)
  }, [])

  return {
    status: active ? status : 'idle',
    endReason,
    room,
    view,
    setCode,
    setTitle,
    clockOffset,
    answer: (questionId, choice) => sendHost({ v: 1, t: 'answer', questionId, choice }),
    power: (kind) => sendHost({ v: 1, t: 'power', kind }),
    match: (matched, done) => sendHost({ v: 1, t: 'match', matched, done }),
    retry: () => {
      setStatus('connecting')
      setEndReason(null)
      room.reconnect()
    },
  }
}
