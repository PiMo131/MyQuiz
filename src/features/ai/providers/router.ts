/**
 * Provider router. Picks the best available provider according to settings:
 *   auto: byok (configured) → chrome-nano (available) → webllm (consented + cached/loaded) → heuristics
 * Returns `null` when only heuristics are possible; callers then use domain/ai heuristics.
 */
import type { AiSettings } from '@/domain/types'
import type { Prompt } from '@/domain/ai/prompts'
import { useSettings } from '@/app/settings-store'
import {
  AiUnavailableError,
  type ActiveProviderKind,
  type ChatMessage,
  type ChatOptions,
  type ChatProvider,
} from './types'
import { beginBusy, useAiStatusStore } from './status'
import { byokConfigured, createByokProvider } from './byok'
import { chromeNanoAvailability, chromeNanoProvider, hasChromeNanoApi } from './chromeNano'
import { chooseDefaultModel, hasWebGpu, isModelCached, webllmLoadedModel, webllmProvider } from './webllm'

const settingsNow = (): AiSettings => useSettings.getState().settings.ai
const byok = createByokProvider(settingsNow)

export async function webllmUsable(ai: AiSettings): Promise<boolean> {
  if (!ai.webllmConsent || !hasWebGpu()) return false
  const model = ai.webllmModel ?? chooseDefaultModel()
  if (webllmLoadedModel() === model) return true
  return isModelCached(model)
}

/** Resolve which provider to use. Also updates the status store. */
export async function resolveProvider(ai: AiSettings = settingsNow()): Promise<ChatProvider | null> {
  let picked: ChatProvider | null = null
  switch (ai.provider) {
    case 'heuristics':
      picked = null
      break
    case 'byok':
      picked = byokConfigured(ai) ? byok : null
      break
    case 'chrome-nano':
      picked =
        hasChromeNanoApi() && (await chromeNanoAvailability()) === 'available' ? chromeNanoProvider : null
      break
    case 'webllm':
      picked = ai.webllmConsent && hasWebGpu() ? webllmProvider : null
      break
    default: {
      if (byokConfigured(ai)) picked = byok
      else if (hasChromeNanoApi() && (await chromeNanoAvailability()) === 'available')
        picked = chromeNanoProvider
      else if (await webllmUsable(ai)) picked = webllmProvider
      else picked = null
    }
  }
  const active: ActiveProviderKind = picked?.kind ?? 'heuristics'
  const st = useAiStatusStore.getState()
  if (st.active !== active || !st.resolved) st.set({ active, resolved: true })
  return picked
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const p = await resolveProvider()
  if (!p) throw new AiUnavailableError()
  const done = beginBusy()
  try {
    return await p.chat(messages, opts)
  } catch (e) {
    useAiStatusStore.getState().set({ lastError: (e as Error).message })
    throw e
  } finally {
    done()
  }
}

export async function* chatStream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncIterable<string> {
  const p = await resolveProvider()
  if (!p) throw new AiUnavailableError()
  const done = beginBusy()
  try {
    yield* p.chatStream(messages, opts)
  } catch (e) {
    useAiStatusStore.getState().set({ lastError: (e as Error).message })
    throw e
  } finally {
    done()
  }
}

export function promptMessages(p: Prompt): ChatMessage[] {
  return [
    { role: 'system', content: p.system },
    { role: 'user', content: p.user },
  ]
}

/** Run a prompt built by domain/ai/prompts and parse its JSON. Throws AiUnavailableError without a provider. */
export async function runPrompt<T>(p: Prompt, parse: (raw: string) => T, signal?: AbortSignal): Promise<T> {
  const raw = await chat(promptMessages(p), {
    json: p.schema,
    maxTokens: p.maxTokens,
    temperature: p.temperature,
    signal,
  })
  return parse(raw)
}

/** Run a prompt with a heuristic fallback; returns which path produced the result. */
export async function runPromptOrFallback<T>(
  p: Prompt,
  parse: (raw: string) => T,
  fallback: () => T,
  opts: { signal?: AbortSignal; accept?: (v: T) => boolean } = {},
): Promise<{ value: T; provider: ActiveProviderKind }> {
  const provider = await resolveProvider()
  if (provider) {
    try {
      const value = await runPrompt(p, parse, opts.signal)
      if (!opts.accept || opts.accept(value)) return { value, provider: provider.kind }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      useAiStatusStore.getState().set({ lastError: (e as Error).message })
    }
  }
  return { value: fallback(), provider: 'heuristics' }
}
