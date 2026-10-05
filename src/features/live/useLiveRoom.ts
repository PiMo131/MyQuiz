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

interface RoomInfo {
  key: string
  status: Exclude<RoomStatus, 'idle' | 'opening'>
  error: string | null
  selfId: string | null
  peers: string[]
  relayOpen: boolean
}

export function useLiveRoom({ code, onMessage, onPeerJoin, onPeerLeave }: UseLiveRoomOptions): UseLiveRoom {
  const [strategy, setStrategyState] = useState<LiveStrategy>(() => loadStrategy())
  const [attempt, setAttempt] = useState(0)
  const [info, setInfo] = useState<RoomInfo | null>(null)
  const roomRef = useRef<LiveRoom | null>(null)
  const handlers = useRef({ onMessage, onPeerJoin, onPeerLeave })
  useEffect(() => {
    handlers.current = { onMessage, onPeerJoin, onPeerLeave }
  })

  const key = code ? `${code}|${strategy}|${attempt}` : null

  useEffect(() => {
    if (!key || !code) return
    let cancelled = false
    let room: LiveRoom | null = null
    let poll: ReturnType<typeof setInterval> | undefined
    const patch = (p: Partial<RoomInfo>) => setInfo((prev) => ({ key, status: 'open', error: null, selfId: null, peers: [], relayOpen: false, ...(prev?.key === key ? prev : {}), ...p }))
    void openRoom(code, { strategy, customRelays: loadCustomRelays() })
      .then((r) => {
        if (cancelled) {
          void r.leave()
          return
        }
        room = r
        roomRef.current = r
        patch({ status: 'open', selfId: r.selfId, peers: r.peers() })
        r.onMessage((m, p) => handlers.current.onMessage?.(m, p))
        r.onPeerJoin((p) => {
          patch({ peers: r.peers() })
          handlers.current.onPeerJoin?.(p)
        })
        r.onPeerLeave((p) => {
          patch({ peers: r.peers() })
          handlers.current.onPeerLeave?.(p)
        })
        poll = setInterval(() => patch({ relayOpen: r.relayState() === 'open' }), 1000)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        patch({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
      roomRef.current = null
      if (room) void room.leave()
    }
  }, [key, code, strategy])

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

  const current = info && info.key === key ? info : null
  const status: RoomStatus = !key ? 'idle' : current ? current.status : 'opening'

  return {
    status,
    error: current?.error ?? null,
    peers: current?.peers ?? [],
    selfId: current?.selfId ?? null,
    relayOpen: current?.relayOpen ?? false,
    strategy,
    setStrategy,
    send,
    reconnect,
    webRtcSupported: supportsWebRtc(),
  }
}
