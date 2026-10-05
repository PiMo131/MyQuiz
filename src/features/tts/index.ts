/** Text-to-speech public API. */
export { speak, stop, pause, resume, pickVoice, chunkText, voicesFor, loadVoices, wait, useTtsStore } from './engine'
export type { SpeakOptions } from './engine'
export { useTts } from './useTts'
export { TtsButton, TtsSettingsPanel } from './TtsComponents'
