/**
 * WebLLM provider (in-browser model via WebGPU). `@mlc-ai/web-llm` is ONLY loaded via dynamic
 * import after the user consented, so the app start never pays for it.
 */
import type { MLCEngine, ChatCompletionMessageParam, InitProgressReport } from '@mlc-ai/web-llm'
import { type ChatMessage, type ChatOptions, type ChatProvider, throwIfAborted, withJsonInstruction } from './types'
import { useAiStatusStore } from './status'

export interface WebllmModelInfo {
  id: string
  label: string
  /** Approximate download size in MB. */
  sizeMb: number
  vramMb: number
}

export const WEBLLM_MODELS: WebllmModelInfo[] = [
  { id: 'Qwen3-0.6B-q4f16_1-MLC', label: 'Qwen3 0.6B (small, fast)', sizeMb: 560, vramMb: 1403 },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', label: 'Qwen3 1.7B (better quality)', sizeMb: 1150, vramMb: 2037 },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B (fallback)', sizeMb: 720, vramMb: 879 },
]
export const WEBLLM_FALLBACK_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'

export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

function isDesktop(): boolean {
  if (typeof navigator === 'undefined') return true
  const ua = navigator.userAgent
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (uaData?.mobile !== undefined) return !uaData.mobile
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(ua)
}

/** Default model for this device: 1.7B on desktops with >= 8 GB RAM, otherwise 0.6B. */
export function chooseDefaultModel(): string {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  return isDesktop() && mem >= 8 ? 'Qwen3-1.7B-q4f16_1-MLC' : 'Qwen3-0.6B-q4f16_1-MLC'
}

type WebllmModule = typeof import('@mlc-ai/web-llm')
let modPromise: Promise<WebllmModule> | null = null
function loadModule(): Promise<WebllmModule> {
  modPromise ??= import('@mlc-ai/web-llm')
  return modPromise
}

let engine: MLCEngine | null = null
let engineModel: string | null = null
let enginePromise: Promise<MLCEngine> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
const IDLE_UNLOAD_MS = 5 * 60_000

function touchIdle() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => void unloadWebllm(), IDLE_UNLOAD_MS)
}

export function webllmLoadedModel(): string | null {
  return engine ? engineModel : null
}

export async function isModelCached(modelId: string): Promise<boolean> {
  if (!hasWebGpu()) return false
  try {
    const mod = await loadModule()
    return await mod.hasModelInCache(modelId)
  } catch {
    return false
  }
}

export async function removeModelFromCache(modelId: string): Promise<void> {
  const mod = await loadModule()
  if (engineModel === modelId) await unloadWebllm()
  await mod.deleteModelAllInfoInCache(modelId)
  useAiStatusStore.getState().patchWebllm({ cached: false, state: 'idle', progress: 0, text: '' })
}

export async function unloadWebllm(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  const e = engine
  engine = null
  engineModel = null
  enginePromise = null
  if (e) {
    try {
      await e.unload()
    } catch {
      /* ignore */
    }
  }
  useAiStatusStore.getState().patchWebllm({ state: 'idle', progress: 0, text: '' })
}

/** Load (download on first use) the model. Progress is pushed to the status store. */
export async function loadWebllm(modelId: string = chooseDefaultModel()): Promise<MLCEngine> {
  if (engine && engineModel === modelId) return engine
  if (enginePromise && engineModel === modelId) return enginePromise
  if (!hasWebGpu()) throw new Error('WebGPU not available')
  if (engine) await unloadWebllm()
  engineModel = modelId
  const store = useAiStatusStore.getState()
  store.patchWebllm({ state: 'loading', progress: 0, text: '', model: modelId, error: undefined })
  enginePromise = (async () => {
    const mod = await loadModule()
    const onProgress = (r: InitProgressReport) => useAiStatusStore.getState().patchWebllm({ progress: Math.min(1, r.progress), text: r.text })
    const tryCreate = (id: string) => mod.CreateMLCEngine(id, { initProgressCallback: onProgress, logLevel: 'ERROR' })
    let e: MLCEngine
    try {
      e = await tryCreate(modelId)
    } catch (err) {
      if (modelId !== WEBLLM_FALLBACK_MODEL) {
        useAiStatusStore.getState().patchWebllm({ text: `Fallback → ${WEBLLM_FALLBACK_MODEL}`, model: WEBLLM_FALLBACK_MODEL })
        engineModel = WEBLLM_FALLBACK_MODEL
        e = await tryCreate(WEBLLM_FALLBACK_MODEL)
      } else throw err
    }
    engine = e
    useAiStatusStore.getState().patchWebllm({ state: 'ready', progress: 1, text: '', cached: true, model: engineModel ?? modelId })
    touchIdle()
    return e
  })()
  try {
    return await enginePromise
  } catch (err) {
    engine = null
    engineModel = null
    enginePromise = null
    useAiStatusStore.getState().patchWebllm({ state: 'error', error: (err as Error).message })
    throw err
  }
}

function toParams(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam)
}

function isQwen(model: string | null): boolean {
  return !!model && /qwen3/i.test(model)
}

async function requestBody(messages: ChatMessage[], opts: ChatOptions) {
  const e = await loadWebllm(useAiStatusStore.getState().webllm.model ?? chooseDefaultModel())
  touchIdle()
  const msgs = toParams(withJsonInstruction(messages, opts.json))
  if (isQwen(engineModel) && msgs.length) {
    // belt and braces: Qwen3 also honours "/no_think" in the last user turn
    const last = msgs[msgs.length - 1]
    if (last.role === 'user' && typeof last.content === 'string') last.content = `${last.content} /no_think`
  }
  return {
    engine: e,
    base: {
      messages: msgs,
      max_tokens: opts.maxTokens ?? 512,
      temperature: opts.temperature ?? 0.5,
      extra_body: { enable_thinking: false },
    },
  }
}

function stripThink(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

export const webllmProvider: ChatProvider = {
  kind: 'webllm',
  async chat(messages, opts = {}) {
    throwIfAborted(opts.signal)
    const { engine: e, base } = await requestBody(messages, opts)
    const run = (withSchema: boolean) =>
      e.chat.completions.create({
        ...base,
        stream: false,
        response_format: opts.json && withSchema ? { type: 'json_object', schema: JSON.stringify(opts.json) } : undefined,
      })
    let res
    try {
      res = await run(true)
    } catch (err) {
      if (!opts.json) throw err
      res = await run(false) // grammar not supported for this model: fall back to instruction-only JSON
    }
    throwIfAborted(opts.signal)
    return stripThink(res.choices[0]?.message?.content ?? '')
  },
  async *chatStream(messages, opts = {}) {
    throwIfAborted(opts.signal)
    const { engine: e, base } = await requestBody(messages, opts)
    const stream = await e.chat.completions.create({ ...base, stream: true })
    let inThink = false
    for await (const chunk of stream) {
      if (opts.signal?.aborted) {
        await e.interruptGenerate()
        return
      }
      let delta = chunk.choices[0]?.delta?.content ?? ''
      if (!delta) continue
      // hide thinking tokens if the model still emits them
      if (delta.includes('<think>')) inThink = true
      if (inThink) {
        if (delta.includes('</think>')) {
          inThink = false
          delta = delta.slice(delta.indexOf('</think>') + 8)
        } else continue
      }
      if (delta) yield delta
    }
  },
}
