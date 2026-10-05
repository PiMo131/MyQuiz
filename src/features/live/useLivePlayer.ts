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

interface Link {
  hostPeer: string | null
  view: PlayerView | null
  setCode: string | null
  setTitle: string
  clockOffset: number
}
const NO_LINK: Link = { hostPeer: null, view: null, setCode: null, setTitle: '', clockOffset: 0 }

export function useLivePlayer(code: string | null, identity: PlayerIdentity | null): UseLivePlayer {
  const [link, setLink] = useState<Link>(NO_LINK)
  const [endReason, setEndReason] = useState<UseLivePlayer['endReason']>(null)
  const [timedOut, setTimedOut] = useState(false)
  const identityRef = useRef(identity)
  const hostPeerRef = useRef<string | null>(null)
  const roomRef = useRef<UseLiveRoom | null>(null)
  useEffect(() => {
    identityRef.current = identity
  })

  const hello = useCallback((target?: string) => {
    const id = identityRef.current
    if (!id) return
    const msg: ClientMessage = { v: 1, t: 'hello', player: id }
    void roomRef.current?.send(msg, target)
  }, [])

  const onMessage = useCallback((raw: unknown, peerId: string) => {
    if (!isHostMessage(raw)) return
    if (raw.t !== 'welcome' && hostPeerRef.current && peerId !== hostPeerRef.current) return
    switch (raw.t) {
      case 'welcome':
        hostPeerRef.current = peerId
        setLink({ hostPeer: peerId, view: raw.view, setCode: raw.set || null, setTitle: raw.title, clockOffset: raw.view.now - Date.now() })
        setEndReason(null)
        break
      case 'view':
        hostPeerRef.current = peerId
        setLink((l) => ({ ...l, hostPeer: peerId, view: raw.view, clockOffset: raw.view.now - Date.now() }))
        break
      case 'end':
        setEndReason(raw.reason)
        break
    }
  }, [])

  // Every new peer might be the host; non-hosts ignore hello messages.
  const onPeerJoin = useCallback((peerId: string) => hello(peerId), [hello])
  const onPeerLeave = useCallback((peerId: string) => {
    if (peerId !== hostPeerRef.current) return
    hostPeerRef.current = null
    setLink((l) => ({ ...l, hostPeer: null }))
    setEndReason((r) => r ?? 'hostLeft')
  }, [])

  // Say goodbye when leaving the page (declared before useLiveRoom so it runs before the room closes).
  useEffect(() => {
    return () => {
      const r = roomRef.current
      const h = hostPeerRef.current
      if (r && h) void r.send({ v: 1, t: 'bye' } satisfies ClientMessage, h)
    }
  }, [])

  const active = Boolean(code && identity)
  const room = useLiveRoom({ code: active ? code : null, onMessage, onPeerJoin, onPeerLeave })
  useEffect(() => {
    roomRef.current = room
  })

  // (Re)announce ourselves once the room is open, and keep knocking until the host answers.
  useEffect(() => {
    if (!active || room.status !== 'open') return
    hello()
    const retry = setInterval(() => {
      if (!hostPeerRef.current) hello()
    }, 3000)
    return () => clearInterval(retry)
  }, [active, room.status, hello])

  const connected = active && room.status === 'open' && link.hostPeer !== null
  const connecting = active && !connected && endReason === null

  // Join timeout → let the UI offer fallbacks.
  useEffect(() => {
    if (!connecting) return
    const t = setTimeout(() => setTimedOut(true), JOIN_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [connecting, room.status])

  const sendHost = useCallback((msg: ClientMessage) => {
    const h = hostPeerRef.current
    if (h) void roomRef.current?.send(msg, h)
  }, [])

  let status: PlayerStatus = 'idle'
  if (active) {
    if (endReason !== null) status = 'ended'
    else if (connected) status = 'connected'
    else if (timedOut) status = 'timeout'
    else status = 'connecting'
  }

  return {
    status,
    endReason,
    room,
    view: link.view,
    setCode: link.setCode,
    setTitle: link.setTitle,
    clockOffset: link.clockOffset,
    answer: (questionId, choice) => sendHost({ v: 1, t: 'answer', questionId, choice }),
    power: (kind) => sendHost({ v: 1, t: 'power', kind }),
    match: (matched, done) => sendHost({ v: 1, t: 'match', matched, done }),
    retry: () => {
      hostPeerRef.current = null
      setLink((l) => ({ ...NO_LINK, view: l.view }))
      setEndReason(null)
      setTimedOut(false)
      room.reconnect()
    },
  }
}
