/**
 * Bring-your-own-key provider. Talks directly from the browser to the vendor the user configured
 * (OpenAI-compatible chat completions, or Anthropic Messages), or to the optional Cloudflare proxy.
 * The key never leaves the device except towards that vendor.
 */
import type { AiSettings, ByokVendor } from '@/domain/types'
import {
  type ChatMessage,
  type ChatOptions,
  type ChatProvider,
  throwIfAborted,
  withJsonInstruction,
} from './types'

export interface VendorInfo {
  id: ByokVendor
  label: string
  baseUrl: string
  defaultModel: string
  keyUrl: string
  openAiCompatible: boolean
}

export const VENDORS: VendorInfo[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    openAiCompatible: true,
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    openAiCompatible: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    keyUrl: 'https://openrouter.ai/keys',
    openAiCompatible: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    openAiCompatible: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-5-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    openAiCompatible: false,
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    defaultModel: '',
    keyUrl: '',
    openAiCompatible: true,
  },
]

export function vendorInfo(id: ByokVendor): VendorInfo {
  return VENDORS.find((v) => v.id === id) ?? VENDORS[VENDORS.length - 1]
}

export function byokConfigured(ai: AiSettings): boolean {
  if (ai.proxyUrl?.trim()) return true
  const b = ai.byok
  if (!b?.apiKey?.trim()) return false
  if (b.vendor === 'custom') return !!b.baseUrl?.trim()
  return true
}

interface Target {
  kind: 'openai' | 'anthropic'
  url: string
  headers: Record<string, string>
  model: string
}

function resolveTarget(ai: AiSettings): Target {
  const proxy = ai.proxyUrl?.trim()
  const b = ai.byok
  if (proxy) {
    const url = /\/chat\/completions\/?$/.test(proxy)
      ? proxy
      : proxy.replace(/\/$/, '') + '/v1/chat/completions'
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (b?.apiKey) headers.authorization = `Bearer ${b.apiKey}`
    return { kind: 'openai', url, headers, model: b?.model?.trim() || '' }
  }
  if (!b) throw new Error('No API key configured')
  const info = vendorInfo(b.vendor)
  const model = b.model?.trim() || info.defaultModel
  if (b.vendor === 'anthropic') {
    return {
      kind: 'anthropic',
      url: `${info.baseUrl}/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': b.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      model,
    }
  }
  const base = (b.vendor === 'custom' ? (b.baseUrl ?? '') : info.baseUrl).replace(/\/$/, '')
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${b.apiKey}`,
  }
  if (b.vendor === 'openrouter') {
    headers['http-referer'] = typeof location !== 'undefined' ? location.origin : 'https://myquizz.app'
    headers['x-title'] = 'MyQuizz'
  }
  return { kind: 'openai', url: `${base}/chat/completions`, headers, model }
}

async function errorText(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } | string; message?: string }
    const e = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message)
    return `${res.status} ${e ?? res.statusText}`
  } catch {
    return `${res.status} ${res.statusText}`
  }
}

/** Parse a text/event-stream body into `data:` payload strings. */
async function* sseLines(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel()
        return
      }
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '')
        buf = buf.slice(idx + 1)
        if (line.startsWith('data:')) yield line.slice(5).trim()
      }
    }
    if (buf.startsWith('data:')) yield buf.slice(5).trim()
  } finally {
    reader.releaseLock()
  }
}

function openAiBody(
  t: Target,
  messages: ChatMessage[],
  opts: ChatOptions,
  stream: boolean,
  withFormat: boolean,
) {
  const body: Record<string, unknown> = {
    messages: withJsonInstruction(messages, opts.json),
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.5,
    stream,
  }
  if (t.model) body.model = t.model
  if (opts.json && withFormat) body.response_format = { type: 'json_object' }
  return body
}

function anthropicBody(t: Target, messages: ChatMessage[], opts: ChatOptions, stream: boolean) {
  const msgs = withJsonInstruction(messages, opts.json)
  const system = msgs
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const rest = msgs.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
  if (!rest.length || rest[0].role !== 'user') rest.unshift({ role: 'user', content: ' ' })
  const body: Record<string, unknown> = {
    model: t.model,
    max_tokens: opts.maxTokens ?? 1024,
    messages: rest,
    stream,
  }
  if (system) body.system = system
  if (opts.temperature !== undefined) body.temperature = Math.min(1, opts.temperature)
  return body
}

export function createByokProvider(getSettings: () => AiSettings): ChatProvider {
  return {
    kind: 'byok',
    async chat(messages, opts = {}) {
      throwIfAborted(opts.signal)
      const t = resolveTarget(getSettings())
      if (t.kind === 'anthropic') {
        const res = await fetch(t.url, {
          method: 'POST',
          headers: t.headers,
          body: JSON.stringify(anthropicBody(t, messages, opts, false)),
          signal: opts.signal,
        })
        if (!res.ok) throw new Error(await errorText(res))
        const j = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string }
        if (j.stop_reason === 'refusal') throw new Error('The model declined this request')
        return (j.content ?? [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('')
      }
      const send = (withFormat: boolean) =>
        fetch(t.url, {
          method: 'POST',
          headers: t.headers,
          body: JSON.stringify(openAiBody(t, messages, opts, false, withFormat)),
          signal: opts.signal,
        })
      let res = await send(true)
      if (!res.ok && opts.json && res.status === 400) res = await send(false) // vendor without response_format
      if (!res.ok) throw new Error(await errorText(res))
      const j = (await res.json()) as { choices?: { message?: { content?: string | null } }[] }
      return j.choices?.[0]?.message?.content ?? ''
    },
    async *chatStream(messages, opts = {}) {
      throwIfAborted(opts.signal)
      const t = resolveTarget(getSettings())
      const body =
        t.kind === 'anthropic'
          ? anthropicBody(t, messages, opts, true)
          : openAiBody(t, messages, opts, true, false)
      const res = await fetch(t.url, {
        method: 'POST',
        headers: { ...t.headers, accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: opts.signal,
      })
      if (!res.ok) throw new Error(await errorText(res))
      if (!res.body) return
      if (!/text\/event-stream/.test(res.headers.get('content-type') ?? '')) {
        // proxy/vendor answered without streaming
        const j = (await res.json()) as {
          choices?: { message?: { content?: string | null } }[]
          content?: { type: string; text?: string }[]
        }
        yield j.choices?.[0]?.message?.content ?? (j.content ?? []).map((b) => b.text ?? '').join('')
        return
      }
      for await (const data of sseLines(res.body, opts.signal)) {
        if (!data || data === '[DONE]') continue
        let ev: unknown
        try {
          ev = JSON.parse(data)
        } catch {
          continue
        }
        const e = ev as {
          type?: string
          delta?: { type?: string; text?: string }
          choices?: { delta?: { content?: string | null } }[]
        }
        if (t.kind === 'anthropic') {
          if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text)
            yield e.delta.text
        } else {
          const c = e.choices?.[0]?.delta?.content
          if (c) yield c
        }
      }
    },
  }
}

/** Minimal connectivity check for the settings panel. */
export async function testByok(
  ai: AiSettings,
): Promise<{ ok: true; sample: string } | { ok: false; error: string }> {
  try {
    const p = createByokProvider(() => ai)
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 20_000)
    const text = await p.chat([{ role: 'user', content: 'Reply with the single word OK.' }], {
      maxTokens: 5,
      temperature: 0,
      signal: ctl.signal,
    })
    clearTimeout(timer)
    return { ok: true, sample: text.trim().slice(0, 40) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
