import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { diffAnswer, type DiffPart } from '@/domain/grading'
import { cn } from '@/ui'

function Parts({ parts, tone }: { parts: DiffPart[]; tone: 'given' | 'expected' }) {
  return (
    <span className="break-words [overflow-wrap:anywhere]">
      {parts.map((p, i) => (
        <span
          key={i}
          className={cn(
            p.type === 'extra' && tone === 'given' && 'rounded bg-error-soft font-semibold text-error line-through decoration-error/60',
            p.type === 'missing' && tone === 'expected' && 'rounded bg-accent-soft font-semibold text-accent',
          )}
        >
          {p.text}
        </span>
      ))}
    </span>
  )
}

/** "You said / Correct answer" comparison with red/green character diff. */
export function AnswerDiff({ given, expected, onOverride, className }: { given: string; expected: string; onOverride?: () => void; className?: string }) {
  const { t } = useTranslation('study')
  const diff = useMemo(() => diffAnswer(given, expected), [given, expected])
  return (
    <div className={cn('space-y-4 text-sm', className)}>
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">{t('feedback.youSaid')}</div>
          {onOverride && (
            <button className="text-xs font-semibold text-secondary hover:underline" onClick={onOverride}>
              {t('feedback.iWasCorrect')}
            </button>
          )}
        </div>
        <div className="mt-1 text-base">{given.trim() ? <Parts parts={diff.given} tone="given" /> : <span className="italic text-muted">{t('feedback.noAnswer')}</span>}</div>
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-muted">{t('feedback.correctAnswer')}</div>
        <div className="mt-1 text-base"><Parts parts={diff.expected} tone="expected" /></div>
      </div>
    </div>
  )
}
