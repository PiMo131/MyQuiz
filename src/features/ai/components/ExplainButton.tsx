import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import type { Card, QuestionType } from '@/domain/types'
import { Markdown, cn, toast } from '@/ui'
import { explainAnswerStream } from '../api'
import type { ActiveProviderKind } from '../providers/types'
import { ProviderChip } from './ProviderChip'

export interface ExplainButtonProps {
  card: Card
  givenAnswer?: string
  questionType?: QuestionType
  side?: 'term' | 'definition'
  className?: string
  /** Open immediately (e.g. after a wrong answer). */
  autoOpen?: boolean
}

/** Inline expandable "Explain" panel with streaming explanation and 👍/👎 feedback. */
export function ExplainButton({
  card,
  givenAnswer,
  questionType,
  side,
  className,
  autoOpen,
}: ExplainButtonProps) {
  const { t, i18n } = useTranslation('ai')
  const [open, setOpen] = useState(!!autoOpen)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<ActiveProviderKind>('heuristics')
  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    const ctl = new AbortController()
    abort.current = ctl
    setLoading(true)
    void (async () => {
      const it = explainAnswerStream({
        card,
        givenAnswer,
        questionType,
        side,
        lang: i18n.language,
        signal: ctl.signal,
      })
      try {
        for (;;) {
          const r = await it.next()
          if (r.done) {
            setProvider(r.value)
            break
          }
          if (ctl.signal.aborted) return
          setText((p) => p + r.value)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setText((p) => p || t('explain.error'))
      } finally {
        if (!ctl.signal.aborted) setLoading(false)
      }
    })()
    return () => ctl.abort()
  }, [open, card.id, givenAnswer, questionType, side, i18n.language, card, t])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-soft',
          className,
        )}
      >
        <Sparkles size={14} />
        {t('explain.button')}
      </button>
    )
  }
  return (
    <div
      className={cn('animate-pop rounded-2xl border border-border bg-surface-2/60 p-4 text-sm', className)}
      role="region"
      aria-live="polite"
      aria-label={t('explain.title')}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
          <Sparkles size={14} />
          {t('explain.title')}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full p-1 text-muted hover:bg-surface hover:text-text"
          aria-label={t('common.close', { ns: 'common' })}
        >
          <X size={16} />
        </button>
      </div>
      <div className="min-h-6 leading-relaxed">
        {text ? (
          <Markdown src={text} as="div" />
        ) : (
          loading && <span className="inline-block h-4 w-24 animate-pulse rounded bg-border" />
        )}
        {loading && text && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" aria-hidden />
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('explain.helpful')}
            aria-pressed={vote === 'up'}
            onClick={() => {
              setVote('up')
              toast.success(t('explain.thanks'))
            }}
            className={cn('rounded-full p-1.5 hover:bg-surface', vote === 'up' && 'text-accent')}
          >
            <ThumbsUp size={14} />
          </button>
          <button
            type="button"
            aria-label={t('explain.notHelpful')}
            aria-pressed={vote === 'down'}
            onClick={() => {
              setVote('down')
              toast.info(t('explain.thanks'))
            }}
            className={cn('rounded-full p-1.5 hover:bg-surface', vote === 'down' && 'text-error')}
          >
            <ThumbsDown size={14} />
          </button>
        </div>
        <span className="inline-flex items-center gap-2">
          {t('footer.enhanced')}
          <ProviderChip provider={provider} />
        </span>
      </div>
    </div>
  )
}
