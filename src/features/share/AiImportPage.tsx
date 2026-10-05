import { useCallback, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ClipboardCopy, Download, ExternalLink, FileUp, MessageSquareText } from 'lucide-react'
import { parseChatbotOutput } from '@/domain/import-export/parsers'
import { Button, Card, cn, toast } from '@/ui'
import { parseErrorKey } from './share-utils'

const CHATBOTS: Array<{ name: string; url: string }> = [
  { name: 'ChatGPT', url: 'https://chatgpt.com' },
  { name: 'Claude', url: 'https://claude.ai' },
  { name: 'Gemini', url: 'https://gemini.google.com' },
]

/** Prompt files live in public/ai and are precached by the PWA, so this works offline too. */
function promptUrlFor(language: string): string {
  return `${import.meta.env.BASE_URL}ai/myquizz-import-skill${language.startsWith('nl') ? '.nl' : ''}.md`
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children?: ReactNode }) {
  const { t } = useTranslation('share')
  return (
    <li>
      <Card className="flex gap-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary" aria-hidden>
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('aiImport.step', { n })}</div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted">{body}</p>
          {children}
        </div>
      </Card>
    </li>
  )
}

export default function AiImportPage() {
  const { t, i18n } = useTranslation('share')
  const navigate = useNavigate()
  const promptUrl = promptUrlFor(i18n.language)
  // Fetched once per language and kept for the page lifetime.
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [showText, setShowText] = useState(false)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const promptText = prompts[promptUrl]

  const loadPrompt = useCallback(async (): Promise<string> => {
    if (promptText) return promptText
    const res = await fetch(promptUrl)
    if (!res.ok) throw new Error('load')
    const text = await res.text()
    setPrompts((p) => ({ ...p, [promptUrl]: text }))
    return text
  }, [promptText, promptUrl])

  const copyPrompt = async () => {
    setLoading(true)
    try {
      const text = await loadPrompt()
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t('aiImport.copied'))
      } catch {
        // No clipboard access (permissions, insecure context): show the text for a manual copy.
        setShowText(true)
        toast.error(t('aiImport.copyFailed'))
      }
    } catch {
      toast.error(t('aiImport.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const toggleText = async () => {
    if (showText) {
      setShowText(false)
      return
    }
    try {
      await loadPrompt()
      setShowText(true)
    } catch {
      toast.error(t('aiImport.loadFailed'))
    }
  }

  const preview = () => {
    try {
      const parsed = parseChatbotOutput(answer)
      navigate('/import', { state: { parsed } })
    } catch (err) {
      setError(t(parseErrorKey(err)))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-teal text-white">
          <MessageSquareText size={22} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t('aiImport.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('aiImport.subtitle')}</p>
        </div>
      </header>

      <ol className="space-y-4">
        <Step n={1} title={t('aiImport.step1Title')} body={t('aiImport.step1Body')} />

        <Step n={2} title={t('aiImport.step2Title')} body={t('aiImport.step2Body')}>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => void copyPrompt()} loading={loading} leftIcon={<ClipboardCopy size={16} />}>
              {t('aiImport.copyPrompt')}
            </Button>
            <a
              href={promptUrl}
              download={promptUrl.split('/').pop()}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-border px-4 text-sm font-semibold transition-colors hover:bg-surface-2"
            >
              <Download size={16} />
              {t('aiImport.downloadMd')}
            </a>
            <Button variant="ghost" size="sm" onClick={() => void toggleText()} aria-expanded={showText} aria-controls="ai-prompt-text">
              {showText ? t('aiImport.hidePrompt') : t('aiImport.showPrompt')}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{t('aiImport.openIn')}</span>
            {CHATBOTS.map((c) => (
              <a key={c.name} href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                {c.name}
                <ExternalLink size={12} aria-hidden />
              </a>
            ))}
          </div>
          {showText && promptText && (
            <pre
              id="ai-prompt-text"
              tabIndex={0}
              aria-label={t('aiImport.promptLabel')}
              onFocus={(e) => {
                const sel = window.getSelection()
                if (!sel) return
                const range = document.createRange()
                range.selectNodeContents(e.currentTarget)
                sel.removeAllRanges()
                sel.addRange(range)
              }}
              className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-2 p-3 text-xs leading-relaxed scrollbar-thin"
            >
              {promptText}
            </pre>
          )}
        </Step>

        <Step n={3} title={t('aiImport.step3Title')} body={t('aiImport.step3Body')} />

        <Step n={4} title={t('aiImport.step4Title')} body={t('aiImport.step4Body')}>
          <label htmlFor="ai-answer" className="sr-only">
            {t('aiImport.answerLabel')}
          </label>
          <textarea
            id="ai-answer"
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value)
              setError(null)
            }}
            rows={8}
            placeholder={t('aiImport.answerPlaceholder')}
            aria-invalid={!!error}
            aria-describedby={error ? 'ai-answer-error' : undefined}
            className={cn(
              'mt-3 w-full rounded-xl border bg-surface p-3 font-mono text-xs placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30',
              error ? 'border-error' : 'border-border',
            )}
          />
          {error && (
            <div id="ai-answer-error" role="alert" className="mt-2 rounded-xl bg-error-soft px-4 py-3 text-sm text-error">
              <p>{error}</p>
              <p className="mt-1 text-xs opacity-80">{t('aiImport.errTip')}</p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Link to="/import" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary">
              <FileUp size={15} aria-hidden />
              {t('aiImport.uploadInstead')}
            </Link>
            <Button onClick={preview} disabled={!answer.trim()} rightIcon={<ArrowRight size={16} />}>
              {t('aiImport.preview')}
            </Button>
          </div>
        </Step>
      </ol>
    </div>
  )
}
