/**
 * MyQuizz AI proxy — Cloudflare Worker.
 *
 * Forwards OpenAI-compatible `POST /v1/chat/completions` requests from the MyQuizz web app to an
 * upstream you configure (Gemini / Groq / OpenRouter / OpenAI …), adding your API key server-side.
 * Includes: CORS allow-list, per-IP rate limiting (Workers Rate Limiting binding), a global daily
 * cap (KV), body-size and max_tokens limits, optional shared client token, and streaming pass-through.
 *
 * Plain TypeScript, no build step besides `wrangler deploy`.
 */

export interface Env {
  UPSTREAM_URL: string
  UPSTREAM_KEY: string
  DEFAULT_MODEL?: string
  FORCE_MODEL?: string
  ALLOWED_ORIGINS?: string
  DAILY_CAP?: string
  MAX_BODY_BYTES?: string
  MAX_TOKENS_CAP?: string
  CLIENT_TOKEN?: string
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> }
  DAILY?: { get(key: string): Promise<string | null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

function corsHeaders(origin: string | null, env: Env): Record<string, string> | null {
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!origin) return allowed.length ? null : {}
  if (allowed.length && !allowed.includes(origin) && !allowed.includes('*')) return null
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin')
    const cors = corsHeaders(origin, env)
    if (!cors) return json(403, { error: { message: 'Origin not allowed' } })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const url = new URL(request.url)
    if (request.method !== 'POST' || !/\/chat\/completions\/?$/.test(url.pathname)) {
      return json(404, { error: { message: 'Use POST /v1/chat/completions' } }, cors)
    }
    if (!env.UPSTREAM_URL || !env.UPSTREAM_KEY) return json(500, { error: { message: 'Proxy not configured' } }, cors)

    if (env.CLIENT_TOKEN) {
      const auth = request.headers.get('authorization') ?? ''
      if (auth !== `Bearer ${env.CLIENT_TOKEN}`) return json(401, { error: { message: 'Invalid client token' } }, cors)
    }

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip })
      if (!success) return json(429, { error: { message: 'Too many requests, try again in a few minutes' } }, { ...cors, 'retry-after': '60' })
    }

    const dailyCap = Number(env.DAILY_CAP ?? '0')
    if (dailyCap > 0 && env.DAILY) {
      const day = new Date().toISOString().slice(0, 10)
      const key = `count:${day}`
      const n = Number((await env.DAILY.get(key)) ?? '0')
      if (n >= dailyCap) return json(429, { error: { message: 'Daily quota reached, try again tomorrow' } }, cors)
      // Best-effort counter (KV is eventually consistent; good enough for a soft cap).
      await env.DAILY.put(key, String(n + 1), { expirationTtl: 60 * 60 * 48 })
    }

    const maxBody = Number(env.MAX_BODY_BYTES ?? '65536')
    const raw = await request.text()
    if (raw.length > maxBody) return json(413, { error: { message: 'Request too large' } }, cors)
    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return json(400, { error: { message: 'Invalid JSON' } }, cors)
    }
    if (!Array.isArray(body.messages)) return json(400, { error: { message: 'messages[] required' } }, cors)

    const cap = Number(env.MAX_TOKENS_CAP ?? '2048')
    const mt = typeof body.max_tokens === 'number' ? body.max_tokens : cap
    body.max_tokens = Math.min(mt, cap)
    if (env.FORCE_MODEL === 'true' || !body.model) body.model = env.DEFAULT_MODEL ?? body.model
    // Never let clients forward tools/function-calling or other expensive features through the free proxy.
    delete body.tools
    delete body.tool_choice
    delete body.n

    const upstream = await fetch(env.UPSTREAM_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.UPSTREAM_KEY}`, accept: body.stream ? 'text/event-stream' : 'application/json' },
      body: JSON.stringify(body),
    })
    const headers = new Headers(cors)
    headers.set('content-type', upstream.headers.get('content-type') ?? 'application/json')
    headers.set('cache-control', 'no-store')
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
