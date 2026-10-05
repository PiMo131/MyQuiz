# MyQuizz AI proxy (Cloudflare Worker)

MyQuizz is a static site: it cannot ship an API key. If you want to offer "real" AI to your users
without them pasting their own key, deploy this tiny Worker. It forwards OpenAI-compatible chat
requests to an upstream of your choice and adds **your** key server-side, with abuse limits.

Users enter the Worker URL under **Settings → AI → Proxy URL** in MyQuizz (optionally with a shared
client token as "API key"). Everything else in the app (card generation, explanations, tutor, podcast
script) then uses the proxy.

## What it does

- `POST /v1/chat/completions` → upstream (`UPSTREAM_URL`) with `Authorization: Bearer UPSTREAM_KEY`
- CORS allow-list (`ALLOWED_ORIGINS`), so only your GitHub Pages origin can call it
- Per-IP rate limit via the Workers **Rate Limiting** binding (default ≈ 30 requests / 10 min)
- Global daily cap via KV (`DAILY_CAP`, default 2000 requests/day)
- Max body size (`MAX_BODY_BYTES`), `max_tokens` cap (`MAX_TOKENS_CAP`), tools stripped
- Optional shared `CLIENT_TOKEN` (cheap extra gate; it is visible to anyone who inspects the app, so treat it as spam protection, not a secret)
- Streaming (`stream: true`) passes straight through

## Free tier

Cloudflare Workers Free: 100 000 requests/day, 10 ms CPU per request (plenty: the Worker only
forwards). KV Free: 100 000 reads / 1 000 writes per day — the daily counter does one read + one
write per request, so set `DAILY_CAP ≤ 1000` on the free tier or remove the KV binding (then only the
per-IP limit applies). Rate Limiting bindings are free.

Upstream costs are yours: Google AI Studio (Gemini Flash) and Groq have generous free tiers; OpenRouter
has `:free` models.

## Deploy

```bash
npm i -g wrangler            # or use npx wrangler
cd extras/cloudflare-worker
cp wrangler.toml.example wrangler.toml
# edit wrangler.toml: UPSTREAM_URL, DEFAULT_MODEL, ALLOWED_ORIGINS
npx wrangler kv namespace create DAILY       # paste the id into wrangler.toml (or delete the kv block)
npx wrangler secret put UPSTREAM_KEY         # your Gemini/Groq/OpenRouter/OpenAI key
npx wrangler secret put CLIENT_TOKEN         # optional
npx wrangler deploy
```

The deploy prints a URL like `https://myquizz-ai-proxy.<you>.workers.dev`. Enter that in MyQuizz.

### Upstream examples

| Vendor      | `UPSTREAM_URL`                                                                   | `DEFAULT_MODEL`                 |
| ----------- | -------------------------------------------------------------------------------- | ------------------------------- |
| Gemini      | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`      | `gemini-2.5-flash`              |
| Groq        | `https://api.groq.com/openai/v1/chat/completions`                               | `llama-3.3-70b-versatile`       |
| OpenRouter  | `https://openrouter.ai/api/v1/chat/completions`                                 | `meta-llama/llama-3.3-70b-instruct:free` |
| OpenAI      | `https://api.openai.com/v1/chat/completions`                                    | `gpt-4.1-mini`                  |

Anthropic's Messages API is not OpenAI-compatible; put it behind OpenRouter if you want Claude via the proxy.

## Notes

- The Rate Limiting binding only supports periods of 10 or 60 seconds; `limit = 3, period = 60`
  approximates 30 requests per 10 minutes. Adjust to your traffic.
- Rotate `UPSTREAM_KEY` if you ever see unexpected usage; the daily cap bounds the damage.
- No request content is logged by this Worker. Cloudflare's own logs apply.
