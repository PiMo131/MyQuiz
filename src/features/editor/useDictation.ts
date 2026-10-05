import { useCallback, useEffect, useRef, useState } from 'react'

interface RecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEventLike {
  resultIndex: number
  results: ArrayLike<RecognitionResultLike>
}
interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: RecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => RecognitionLike

function getCtor(): RecognitionCtor | undefined {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const dictationSupported = (): boolean => !!getCtor()

/** Web Speech API dictation. `onText` receives final transcripts. */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<RecognitionLike | null>(null)
  const cbRef = useRef(onText)
  useEffect(() => {
    cbRef.current = onText
  })

  const stop = useCallback(() => {
    recRef.current?.stop()
    recRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(
    (lang?: string) => {
      const Ctor = getCtor()
      if (!Ctor) return false
      stop()
      const rec = new Ctor()
      rec.lang = lang && lang.length <= 5 && !['chem', 'math'].includes(lang) ? lang : navigator.language
      rec.interimResults = false
      rec.continuous = false
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) cbRef.current(r[0].transcript)
        }
      }
      rec.onend = () => setListening(false)
      rec.onerror = () => setListening(false)
      recRef.current = rec
      rec.start()
      setListening(true)
      return true
    },
    [stop],
  )

  useEffect(() => () => recRef.current?.abort(), [])

  return { listening, start, stop, supported: dictationSupported() }
}
