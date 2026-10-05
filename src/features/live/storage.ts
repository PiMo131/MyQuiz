/** Per-device preferences for live play (localStorage, best effort). */
import { newId } from '@/domain/id'
import type { PlayerIdentity } from '@/domain/live/protocol'
import type { LiveStrategy } from './transport'

const KEY_PLAYER = 'myquizz.live.player'
const KEY_STRATEGY = 'myquizz.live.strategy'
const KEY_RELAYS = 'myquizz.live.relays'
const KEY_CODE = 'myquizz.live.hostCode'
const KEY_SOUND = 'myquizz.live.sound'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadIdentity(defaults: { name: string; avatar: string }): PlayerIdentity {
  const stored = read<Partial<PlayerIdentity>>(KEY_PLAYER)
  return {
    id: stored?.id ?? newId(10),
    name: stored?.name ?? defaults.name,
    avatar: stored?.avatar ?? defaults.avatar,
  }
}
export function saveIdentity(p: PlayerIdentity): void {
  write(KEY_PLAYER, p)
}

export function loadStrategy(): LiveStrategy {
  const s = read<LiveStrategy>(KEY_STRATEGY)
  return s === 'nostr-alt' || s === 'custom' ? s : 'nostr'
}
export function saveStrategy(s: LiveStrategy): void {
  write(KEY_STRATEGY, s)
}
export function loadCustomRelays(): string[] {
  return read<string[]>(KEY_RELAYS) ?? []
}
export function saveCustomRelays(urls: string[]): void {
  write(KEY_RELAYS, urls)
}

/** The host keeps its room code per set across reloads so players do not have to re-scan. */
export function loadHostCode(setId: string): string | null {
  const m = read<Record<string, string>>(KEY_CODE)
  return m?.[setId] ?? null
}
export function saveHostCode(setId: string, code: string): void {
  write(KEY_CODE, { ...(read<Record<string, string>>(KEY_CODE) ?? {}), [setId]: code })
}

export function loadSoundPref(): boolean | null {
  return read<boolean>(KEY_SOUND)
}
export function saveSoundPref(v: boolean): void {
  write(KEY_SOUND, v)
}
