/**
 * Thin wrapper around trystero. Trystero is only ever imported dynamically from here so the
 * `trystero` chunk is loaded when a live room is actually opened.
 */
import type { JoinRoomConfig, JsonValue, MessageAction, Room, TurnServerConfig } from 'trystero'
import { LIVE_APP_ID, roomIdFor } from '@/domain/live/protocol'

export type LiveStrategy = 'nostr' | 'nostr-alt' | 'custom'
export const LIVE_STRATEGIES: LiveStrategy[] = ['nostr', 'nostr-alt', 'custom']

/** Well-known public Nostr relays used when the default trystero list is unreachable. */
export const ALT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
]

export interface TransportOptions {
  strategy: LiveStrategy
  customRelays?: string[]
  turn?: TurnServerConfig[]
}

export type RelayState = 'connecting' | 'open' | 'closed'

export interface LiveRoom {
  selfId: string
  send: (msg: unknown, target?: string | string[]) => Promise<void>
  onMessage: (cb: (msg: unknown, peerId: string) => void) => () => void
  onPeerJoin: (cb: (peerId: string) => void) => () => void
  onPeerLeave: (cb: (peerId: string) => void) => () => void
  peers: () => string[]
  relayState: () => RelayState
  leave: () => Promise<void>
}

type TrysteroModule = typeof import('trystero')

let modPromise: Promise<TrysteroModule> | null = null
function loadTrystero(): Promise<TrysteroModule> {
  modPromise ??= import('trystero')
  return modPromise
}

function relayUrls(opts: TransportOptions): string[] | undefined {
  if (opts.strategy === 'nostr-alt') return ALT_RELAYS
  if (opts.strategy === 'custom') {
    const urls = (opts.customRelays ?? []).map((u) => u.trim()).filter((u) => /^wss?:\/\//.test(u))
    return urls.length ? urls : ALT_RELAYS
  }
  return undefined
}

/** Opens (or joins) the trystero room for a room code. Resolves once the module is loaded, not once peers connect. */
export async function openRoom(code: string, opts: TransportOptions): Promise<LiveRoom> {
  const mod = await loadTrystero()
  const urls = relayUrls(opts)
  const config: JoinRoomConfig = {
    appId: LIVE_APP_ID,
    relayConfig: { urls, redundancy: urls ? Math.min(4, urls.length) : undefined, warnOnRelayFailure: false },
    turnConfig: opts.turn?.length ? opts.turn : undefined,
  }
  const room: Room = mod.joinRoom(config, roomIdFor(code))
  const action: MessageAction<JsonValue> = room.makeAction<JsonValue>('msg')

  const msgSubs = new Set<(msg: unknown, peerId: string) => void>()
  const joinSubs = new Set<(peerId: string) => void>()
  const leaveSubs = new Set<(peerId: string) => void>()
  action.onMessage = (data, { peerId }) => msgSubs.forEach((cb) => cb(data, peerId))
  room.onPeerJoin = (peerId) => joinSubs.forEach((cb) => cb(peerId))
  room.onPeerLeave = (peerId) => leaveSubs.forEach((cb) => cb(peerId))

  const sub = <T>(set: Set<T>) => (cb: T) => {
    set.add(cb)
    return () => {
      set.delete(cb)
    }
  }

  return {
    selfId: mod.selfId,
    send: async (msg, target) => {
      const peers = Object.keys(room.getPeers())
      if (!peers.length) return
      const t = target === undefined ? null : target
      if (Array.isArray(t) && !t.length) return
      await action.send(msg as JsonValue, { target: t })
    },
    onMessage: sub(msgSubs),
    onPeerJoin: sub(joinSubs),
    onPeerLeave: sub(leaveSubs),
    peers: () => Object.keys(room.getPeers()),
    relayState: () => {
      const sockets = (mod.getRelaySockets as () => Record<string, WebSocket>)()
      const states = Object.values(sockets ?? {}).map((s) => s.readyState)
      if (states.some((s) => s === WebSocket.OPEN)) return 'open'
      if (states.some((s) => s === WebSocket.CONNECTING)) return 'connecting'
      return states.length ? 'closed' : 'connecting'
    },
    leave: () => room.leave(),
  }
}

export function supportsWebRtc(): boolean {
  return typeof RTCPeerConnection !== 'undefined'
}
