/**
 * Web Speech API wrapper: voice selection per language, chunking for long text (Chrome stops
 * speaking after ~14 s without events), queue with pauses, and a small zustand store for the UI.
 */
import { create } from 'zustand'
import { plainText } from '@/domain/text'
import { useSettings } from '@/app/settings-store'

export interface SpeakOptions {
  rate?: number
  pitch?: number
  voiceName?: string
  onEnd?: () => void
  onError?: (e: unknown) => void
  /** Called on word boundaries when the engine supports it. */
  onBoundary?: (charIndex: number) => void
}

interface TtsState {
  supported: boolean
  speaking: boolean
  paused: boolean
  voices: SpeechSynthesisVoice[]
  /** Monotonic id of the current utterance group (used to ignore stale callbacks). */
  current: number
}

export const useTtsStore = create<TtsState>(() => ({
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  speaking: false,
  paused: false,
  voices: [],
  current: 0,
}))

export function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  const v = speechSynthesis.getVoices()
  if (v.length) {
    const prev = useTtsStore.getState().voices
    if (prev.length !== v.length) useTtsStore.setState({ voices: v })
  }
  return v
}
if (typeof speechSynthesis !== 'undefined') {
  loadVoices()
  speechSynthesis.addEventListener?.('voiceschanged', () => loadVoices())
}

/** Preferred regional variants for base languages. */
const PREFERRED: Record<string, string[]> = {
  nl: ['nl-NL', 'nl-BE'],
  en: ['en-GB', 'en-US'],
  de: ['de-DE'],
  fr: ['fr-FR'],
  es: ['es-ES'],
}

function score(v: SpeechSynthesisVoice, lang: string): number {
  const base = lang.split('-')[0].toLowerCase()
  const vl = v.lang.replace('_', '-').toLowerCase()
  let s = 0
  if (vl === lang.toLowerCase()) s += 100
  else if (vl.startsWith(base + '-') || vl === base) s += 50
  else return -1
  const pref = PREFERRED[base] ?? []
  const pi = pref.findIndex((p) => p.toLowerCase() === vl)
  if (pi >= 0) s += 20 - pi
  if (v.localService) s += 5
  if (/natural|neural|premium|enhanced|google|microsoft .* online/i.test(v.name)) s += 8
  if (v.default) s += 1
  return s
}

/** Pick the best voice for a language (settings override → regional preference → any match). */
export function pickVoice(
  lang?: string,
  voices: SpeechSynthesisVoice[] = loadVoices(),
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined
  const byLang = useSettings.getState().settings.tts.voiceByLang
  const l = (lang || useSettings.getState().settings.locale || 'en').toLowerCase()
  const base = l.split('-')[0]
  const chosen = byLang[l] ?? byLang[base]
  if (chosen) {
    const v = voices.find((x) => x.name === chosen)
    if (v) return v
  }
  let best: SpeechSynthesisVoice | undefined
  let bestScore = -1
  for (const v of voices) {
    const s = score(v, l)
    if (s > bestScore) {
      best = v
      bestScore = s
    }
  }
  return best
}

export function voicesFor(
  lang: string,
  voices: SpeechSynthesisVoice[] = loadVoices(),
): SpeechSynthesisVoice[] {
  const base = lang.split('-')[0].toLowerCase()
  return voices
    .filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base))
    .sort((a, b) => score(b, lang) - score(a, lang))
}

/** Split text into speakable chunks (~ <200 chars, on sentence/clause boundaries). */
export function chunkText(text: string, max = 180): string[] {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return []
  if (t.length <= max) return [t]
  const sentences = t.split(/(?<=[.!?;:])\s+/)
  const out: string[] = []
  let cur = ''
  const pushCur = () => {
    if (cur.trim()) out.push(cur.trim())
    cur = ''
  }
  for (const s of sentences) {
    if (s.length > max) {
      pushCur()
      // split on commas, then hard-wrap
      let piece = ''
      for (const part of s.split(/(?<=,)\s+/)) {
        if ((piece + ' ' + part).length > max) {
          if (piece) out.push(piece.trim())
          piece = part
          while (piece.length > max) {
            const cut = piece.lastIndexOf(' ', max)
            const at = cut > 40 ? cut : max
            out.push(piece.slice(0, at).trim())
            piece = piece.slice(at)
          }
        } else piece = piece ? `${piece} ${part}` : part
      }
      if (piece) out.push(piece.trim())
    } else if ((cur + ' ' + s).length > max) {
      pushCur()
      cur = s
    } else cur = cur ? `${cur} ${s}` : s
  }
  pushCur()
  return out
}

let keepAlive: ReturnType<typeof setInterval> | null = null
function startKeepAlive() {
  // Chrome bug: long utterances stop silently; pause/resume every 10 s keeps the engine awake.
  stopKeepAlive()
  if (
    typeof navigator !== 'undefined' &&
    /Chrome/.test(navigator.userAgent) &&
    !/Edg|Mobile/.test(navigator.userAgent)
  ) {
    keepAlive = setInterval(() => {
      if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.pause()
        speechSynthesis.resume()
      }
    }, 10_000)
  }
}
function stopKeepAlive() {
  if (keepAlive) clearInterval(keepAlive)
  keepAlive = null
}

/** Speak text (markdown stripped). Resolves when finished or cancelled. */
export function speak(text: string, lang?: string, opts: SpeakOptions = {}): Promise<void> {
  const store = useTtsStore.getState()
  if (!store.supported) return Promise.resolve()
  const settings = useSettings.getState().settings
  const clean = plainText(text)
  if (!clean) return Promise.resolve()
  speechSynthesis.cancel()
  const id = store.current + 1
  useTtsStore.setState({ current: id, speaking: true, paused: false })
  const voice = opts.voiceName ? loadVoices().find((v) => v.name === opts.voiceName) : pickVoice(lang)
  const chunks = chunkText(clean)
  const rate = opts.rate ?? settings.tts.rate ?? 1
  startKeepAlive()
  return new Promise<void>((resolve) => {
    let offset = 0
    let finished = 0
    const finish = () => {
      if (useTtsStore.getState().current === id) {
        useTtsStore.setState({ speaking: false, paused: false })
        stopKeepAlive()
      }
      opts.onEnd?.()
      resolve()
    }
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk)
      const chunkOffset = offset
      offset += chunk.length + 1
      if (voice) {
        u.voice = voice
        u.lang = voice.lang
      } else if (lang) u.lang = lang
      u.rate = Math.min(2, Math.max(0.5, rate))
      u.pitch = opts.pitch ?? 1
      if (opts.onBoundary) u.onboundary = (e) => opts.onBoundary?.(chunkOffset + e.charIndex)
      u.onend = () => {
        finished++
        if (finished >= chunks.length || useTtsStore.getState().current !== id) finish()
      }
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') {
          if (useTtsStore.getState().current !== id) resolve()
          else if (i === chunks.length - 1) finish()
          return
        }
        opts.onError?.(e)
        finish()
      }
      speechSynthesis.speak(u)
    })
  })
}

export function stop(): void {
  if (typeof speechSynthesis === 'undefined') return
  useTtsStore.setState((s) => ({ current: s.current + 1, speaking: false, paused: false }))
  speechSynthesis.cancel()
  stopKeepAlive()
}

export function pause(): void {
  if (typeof speechSynthesis === 'undefined' || !speechSynthesis.speaking) return
  speechSynthesis.pause()
  useTtsStore.setState({ paused: true })
}

export function resume(): void {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.resume()
  useTtsStore.setState({ paused: false })
}

/** Wait `ms` unless `signal` aborts. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted || ms <= 0) return resolve()
    const t = setTimeout(done, ms)
    function done() {
      clearTimeout(t)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}
