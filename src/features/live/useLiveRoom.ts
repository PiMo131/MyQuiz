/**
 * Low-level React binding for a trystero room: opens it lazily, tracks peers and relay state,
 * and exposes send/subscribe. Used by both the host and the player hooks.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { openRoom, supportsWebRtc, type LiveRoom, type LiveStrategy } from './transport'
import { loadCustomRelays, loadStrategy, saveStrategy } from './storage'

export type RoomStatus = 'idle' | 'opening' | 'open' | 'error' | 'closed'

export interface UseLiveRoomOptions {
  /** Room code; the room is opened as soon as it is set. */
  code: string | null
  onMessage?: (msg: unknown, peerId: string) => void
  onPeerJoin?: (peerId: string) => void
  onPeerLeave?: (peerId: string) => void
}

export interface UseLiveRoom {
  status: RoomStatus
  error: string | null
  peers: string[]
  selfId: string | null
  relayOpen: boolean
  strategy: LiveStrategy
  setStrategy: (s: LiveStrategy) => void
  send: (msg: unknown, target?: string | string[]) => Promise<void>
  /** Closes and reopens the room (e.g. after switching relays). */
  reconnect: () => void
  webRtcSupported: boolean
}

export function useLiveRoom({ code, onMessage, onPeerJoin, onPeerLeave }: UseLiveRoomOptions): UseLiveRoom {
  const [status, setStatus] = useState<RoomStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [peers, setPeers] = useState<string[]>([])
  const [selfId, setSelfId] = useState<string | null>(null)
  const [relayOpen, setRelayOpen] = useState(false)
  const [strategy, setStrategyState] = useState<LiveStrategy>(() => loadStrategy())
  const [attempt, setAttempt] = useState(0)
  const roomRef = useRef<LiveRoom | null>(null)
  const handlers = useRef({ onMessage, onPeerJoin, onPeerLeave })
  handlers.current = { onMessage, onPeerJoin, onPeerLeave }

  useEffect(() => {
    if (!code) return
    let cancelled = false
    let room: LiveRoom | null = null
    let poll: ReturnType<typeof setInterval> | undefined
    setStatus('opening')
    setError(null)
    setPeers([])
    void openRoom(code, { strategy, customRelays: loadCustomRelays() })
      .then((r) => {
        if (cancelled) {
          void r.leave()
          return
        }
        room = r
        roomRef.current = r
        setSelfId(r.selfId)
        setStatus('open')
        const refresh = () => setPeers(r.peers())
        r.onMessage((m, p) => handlers.current.onMessage?.(m, p))
        r.onPeerJoin((p) => {
          refresh()
          handlers.current.onPeerJoin?.(p)
        })
        r.onPeerLeave((p) => {
          refresh()
          handlers.current.onPeerLeave?.(p)
        })
        poll = setInterval(() => setRelayOpen(r.relayState() === 'open'), 1000)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
      roomRef.current = null
      if (room) void room.leave()
      setStatus('closed')
      setRelayOpen(false)
    }
  }, [code, strategy, attempt])

  const send = useCallback(async (msg: unknown, target?: string | string[]) => {
    const r = roomRef.current
    if (!r) return
    try {
      await r.send(msg, target)
    } catch {
      /* peer vanished mid-send; onPeerLeave handles it */
    }
  }, [])

  const setStrategy = useCallback((s: LiveStrategy) => {
    saveStrategy(s)
    setStrategyState(s)
  }, [])

  const reconnect = useCallback(() => setAttempt((a) => a + 1), [])

  return { status, error, peers, selfId, relayOpen, strategy, setStrategy, send, reconnect, webRtcSupported: supportsWebRtc() }
}
