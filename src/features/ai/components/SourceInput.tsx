import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileUp, Link2, Mic, MicOff, Type } from 'lucide-react'
import { Button, Input, Tabs, Textarea, cn } from '@/ui'
import { extractText } from '../extract/file'

export type SourceTab = 'paste' | 'upload' | 'url' | 'record'

export interface SourceInputProps {
  value: string
  onChange: (text: string) => void
  tabs?: SourceTab[]
  maxChars?: number
  className?: string
}

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: Event) => void) | null
  start(): void
  stop(): void
}

function recognitionCtor(): (new () => RecognitionLike) | undefined {
  const g = globalThis as unknown as {
    SpeechRecognition?: new () => RecognitionLike
    webkitSpeechRecognition?: new () => RecognitionLike
  }
  return g.SpeechRecognition ?? g.webkitSpeechRecognition
}

/** Paste / upload / URL / record input used by Generate, Study guide and Practice test. */
export function SourceInput({
  value,
  onChange,
  tabs = ['paste', 'upload', 'url', 'record'],
  maxChars = 100_000,
  className,
}: SourceInputProps) {
  const { t, i18n } = useTranslation('ai')
  const [tab, setTab] = useState<SourceTab>(tabs[0])
  const [drag, setDrag] = useState(false)
  const [fileMsg, setFileMsg] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [url, setUrl] = useState('')
  const [urlMsg, setUrlMsg] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const recRef = useRef<RecognitionLike | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recSupported = !!recognitionCtor()

  useEffect(() => () => recRef.current?.stop(), [])

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setFileMsg(null)
    setProgress(0)
    const parts: string[] = []
    const problems: string[] = []
    for (const f of list) {
      const r = await extractText(f, (p) => setProgress(p))
      if (r.ok) parts.push(r.text)
      else
        problems.push(`${f.name}: ${t(`source.fileError.${r.reason}`)}${r.message ? ` (${r.message})` : ''}`)
    }
    setProgress(null)
    if (parts.length) {
      const joined = [value.trim(), ...parts].filter(Boolean).join('\n\n').slice(0, maxChars)
      onChange(joined)
      setFileMsg(t('source.fileLoaded', { count: parts.length }))
      setTab('paste')
    }
    if (problems.length) setFileMsg(problems.join('\n'))
  }

  const fetchUrl = async () => {
    setUrlMsg(null)
    const u = url.trim()
    if (!u) return
    if (!navigator.onLine) return setUrlMsg(t('source.urlOffline'))
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 12_000)
      const res = await fetch(u, { signal: ctl.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(String(res.status))
      const html = await res.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')
      doc.querySelectorAll('script,style,nav,footer,header,aside,noscript').forEach((n) => n.remove())
      const text = (doc.body?.innerText ?? doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
      if (!text) throw new Error('empty')
      onChange([value.trim(), text].filter(Boolean).join('\n\n').slice(0, maxChars))
      setUrlMsg(t('source.urlLoaded'))
      setTab('paste')
    } catch {
      setUrlMsg(t('source.urlBlocked'))
    }
  }

  const toggleRecord = () => {
    if (recording) {
      recRef.current?.stop()
      setRecording(false)
      return
    }
    const Ctor = recognitionCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = i18n.language.startsWith('nl') ? 'nl-NL' : 'en-US'
    rec.continuous = true
    rec.interimResults = false
    let acc = value
    rec.onresult = (e) => {
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '
      if (final) {
        acc = (acc + ' ' + final).trim()
        onChange(acc.slice(0, maxChars))
      }
    }
    rec.onend = () => setRecording(false)
    rec.onerror = () => setRecording(false)
    recRef.current = rec
    rec.start()
    setRecording(true)
  }

  const items = tabs.map((v) => ({ value: v, label: t(`source.tabs.${v}`) }))

  return (
    <div className={cn('space-y-3', className)}>
      <Tabs items={items} value={tab} onChange={setTab} variant="underline" />
      {tab === 'paste' && (
        <div>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
            placeholder={t('source.pastePlaceholder')}
            className="min-h-48 font-[inherit]"
            aria-label={t('source.tabs.paste')}
          />
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>{fileMsg}</span>
            <span>
              {value.length.toLocaleString()}/{maxChars.toLocaleString()}
            </span>
          </div>
        </div>
      )}
      {tab === 'upload' && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            void handleFiles(e.dataTransfer.files)
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            drag ? 'border-primary bg-primary-soft' : 'border-border',
          )}
        >
          <FileUp className="text-primary" />
          <div className="text-sm">{t('source.dropHere')}</div>
          <div className="text-xs text-muted">{t('source.fileTypes')}</div>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.markdown,.csv,.tsv,.pdf,.docx,.json,text/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && void handleFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            loading={progress !== null}
          >
            {progress !== null ? `${Math.round(progress * 100)}%` : t('source.chooseFile')}
          </Button>
          {fileMsg && <p className="whitespace-pre-line text-xs text-muted">{fileMsg}</p>}
        </div>
      )}
      {tab === 'url' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label={t('source.tabs.url')}
            />
            <Button onClick={() => void fetchUrl()} leftIcon={<Link2 size={16} />}>
              {t('source.fetch')}
            </Button>
          </div>
          <p className="text-xs text-muted">{t('source.urlHint')}</p>
          {urlMsg && <p className="text-xs text-highlight">{urlMsg}</p>}
        </div>
      )}
      {tab === 'record' && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border px-6 py-8 text-center">
          {recSupported ? (
            <>
              <Button
                variant={recording ? 'danger' : 'primary'}
                onClick={toggleRecord}
                leftIcon={recording ? <MicOff size={16} /> : <Mic size={16} />}
              >
                {recording ? t('source.stopRecording') : t('source.startRecording')}
              </Button>
              <p className="text-xs text-muted">{t('source.recordHint')}</p>
              {value && <p className="line-clamp-3 max-w-md text-sm text-muted">{value.slice(-300)}</p>}
            </>
          ) : (
            <>
              <Type className="text-muted" />
              <p className="text-sm text-muted">{t('source.recordUnsupported')}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
