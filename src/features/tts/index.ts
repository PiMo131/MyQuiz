/** Text-to-speech public API (stub, implementation follows). */
import { plainText } from '@/domain/text'

export interface SpeakOptions { rate?: number; voiceName?: string; onEnd?: () => void }

export function pickVoice(lang?: string): SpeechSynthesisVoice | undefined {
  if (typeof speechSynthesis === 'undefined') return undefined
  const voices = speechSynthesis.getVoices()
  if (!lang) return voices[0]
  const l = lang.toLowerCase()
  return voices.find((v) => v.lang.toLowerCase() === l) ?? voices.find((v) => v.lang.toLowerCase().startsWith(l.split('-')[0]))
}

export function speak(text: string, lang?: string, opts: SpeakOptions = {}): void {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(plainText(text))
  if (lang) u.lang = lang
  const v = pickVoice(lang)
  if (v) u.voice = v
  u.rate = opts.rate ?? 1
  if (opts.onEnd) u.onend = opts.onEnd
  speechSynthesis.speak(u)
}

export function stop(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

export function useTts() {
  return { speak, stop, speaking: false, supported: typeof speechSynthesis !== 'undefined' }
}

export function TtsButton(_props: { text: string; lang?: string; size?: 'sm' | 'md' }) {
  return null
}
export function TtsSettingsPanel() {
  return null
}
