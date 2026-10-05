/**
 * Chrome built-in Prompt API (Gemini Nano). Feature-detected; never assumed.
 * https://developer.chrome.com/docs/ai/prompt-api
 */
import { type ChatMessage, type ChatOptions, type ChatProvider, throwIfAborted, withJsonInstruction } from './types'
import { useAiStatusStore, type NanoAvailability } from './status'

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

interface LmSession {
  prompt(input: string, opts?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>
  promptStreaming(input: string, opts?: { responseConstraint?: object; signal?: AbortSignal }): ReadableStream<string>
  destroy(): void
}
interface LmCreateOptions {
  initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[]
  temperature?: number
  topK?: number
  signal?: AbortSignal
  monitor?: (m: EventTarget) => void
}
interface LmStatic {
  availability(opts?: object): Promise<Availability>
  create(opts?: LmCreateOptions): Promise<LmSession>
  params(): Promise<{ defaultTemperature: number; maxTemperature: number; defaultTopK: number; maxTopK: number } | null>
}

function api(): LmStatic | undefined {
  const g = globalThis as unknown as { LanguageModel?: LmStatic }
  return 'LanguageModel' in globalThis ? g.LanguageModel : undefined
}

export function hasChromeNanoApi(): boolean {
  return !!api()
}

let cachedAvailability: NanoAvailability | null = null

export async function chromeNanoAvailability(force = false): Promise<NanoAvailability> {
  if (cachedAvailability && !force) return cachedAvailability
  const lm = api()
  let result: NanoAvailability = 'unavailable'
  if (lm) {
    try {
      result = await lm.availability()
    } catch {
      result = 'unavailable'
    }
  }
  cachedAvailability = result
  useAiStatusStore.getState().set({ chromeNano: result })
  return result
}

/** Trigger the one-time model download (needs a user gesture). Resolves when available. */
export async function chromeNanoDownload(onProgress?: (p: number) => void): Promise<boolean> {
  const lm = api()
  if (!lm) return false
  try {
    const s = await lm.create({
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          const ev = e as Event & { loaded?: number; total?: number }
          const p = ev.total ? (ev.loaded ?? 0) / ev.total : (ev.loaded ?? 0)
          onProgress?.(Math.min(1, p))
          useAiStatusStore.getState().set({ chromeNano: p >= 1 ? 'available' : 'downloading' })
        })
      },
    })
    s.destroy()
    cachedAvailability = 'available'
    useAiStatusStore.getState().set({ chromeNano: 'available' })
    return true
  } catch {
    await chromeNanoAvailability(true)
    return false
  }
}

function splitMessages(messages: ChatMessage[]): { system: string; history: ChatMessage[]; last: string } {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const rest = messages.filter((m) => m.role !== 'system')
  const last = rest.length && rest[rest.length - 1].role === 'user' ? rest.pop()!.content : ''
  return { system, history: rest, last }
}

async function createSession(messages: ChatMessage[], opts: ChatOptions): Promise<{ session: LmSession; input: string }> {
  const lm = api()
  if (!lm) throw new Error('Prompt API unavailable')
  // Nano has no native JSON mode without responseConstraint; we add the instruction too for robustness.
  const { system, history, last } = splitMessages(withJsonInstruction(messages, opts.json))
  const create: LmCreateOptions = { signal: opts.signal }
  const initial: NonNullable<LmCreateOptions['initialPrompts']> = []
  if (system) initial.push({ role: 'system', content: system })
  for (const h of history) initial.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })
  if (initial.length) create.initialPrompts = initial
  if (opts.temperature !== undefined) {
    // temperature and topK must be given together
    const params = await lm.params().catch(() => null)
    create.temperature = Math.min(opts.temperature, params?.maxTemperature ?? 2)
    create.topK = params?.defaultTopK ?? 3
  }
  const session = await lm.create(create)
  return { session, input: last || ' ' }
}

export const chromeNanoProvider: ChatProvider = {
  kind: 'chrome-nano',
  async chat(messages, opts = {}) {
    throwIfAborted(opts.signal)
    const { session, input } = await createSession(messages, opts)
    try {
      try {
        return await session.prompt(input, { responseConstraint: opts.json, signal: opts.signal })
      } catch (e) {
        if (opts.json && (e as Error).name !== 'AbortError') {
          // responseConstraint not supported in this build: retry plain
          return await session.prompt(input, { signal: opts.signal })
        }
        throw e
      }
    } finally {
      session.destroy()
    }
  },
  async *chatStream(messages, opts = {}) {
    throwIfAborted(opts.signal)
    const { session, input } = await createSession(messages, opts)
    try {
      const stream = session.promptStreaming(input, { signal: opts.signal })
      const reader = stream.getReader()
      let previous = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        // Older builds emit cumulative text; newer emit deltas. Normalise to deltas.
        const chunk = value.startsWith(previous) && previous.length ? value.slice(previous.length) : value
        previous = value.startsWith(previous) ? value : previous + value
        if (chunk) yield chunk
      }
    } finally {
      session.destroy()
    }
  },
}
