/** Global AI status (zustand). Mirrors provider detection and WebLLM download state for the UI. */
import { create } from 'zustand'
import type { ActiveProviderKind } from './types'

export type NanoAvailability = 'unknown' | 'available' | 'downloadable' | 'downloading' | 'unavailable'
export type WebllmState = 'idle' | 'loading' | 'ready' | 'error'

export interface WebllmStatus {
  state: WebllmState
  progress: number // 0..1
  text: string
  model?: string
  cached?: boolean
  error?: string
}

export interface AiStatusState {
  /** Provider that `resolveProvider()` last picked. */
  active: ActiveProviderKind
  resolved: boolean
  chromeNano: NanoAvailability
  webgpu: boolean
  webllm: WebllmStatus
  busy: number
  lastError?: string
  set: (patch: Partial<Omit<AiStatusState, 'set' | 'patchWebllm'>>) => void
  patchWebllm: (patch: Partial<WebllmStatus>) => void
}

export const useAiStatusStore = create<AiStatusState>((set) => ({
  active: 'heuristics',
  resolved: false,
  chromeNano: 'unknown',
  webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
  webllm: { state: 'idle', progress: 0, text: '' },
  busy: 0,
  set: (patch) => set(patch),
  patchWebllm: (patch) => set((s) => ({ webllm: { ...s.webllm, ...patch } })),
}))

export function beginBusy(): () => void {
  useAiStatusStore.setState((s) => ({ busy: s.busy + 1 }))
  return () => useAiStatusStore.setState((s) => ({ busy: Math.max(0, s.busy - 1) }))
}
