import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Kbd, cn } from '@/ui'
import { useKeydown } from './hooks'
import { useSfx } from './sound'

export interface QuestionPanelProps {
  prompt: string
  options: string[]
  correct: string
  /** called after the feedback delay */
  onAnswer: (given: string, correct: boolean) => void
  /** called immediately when an option is picked (before the feedback delay) */
  onChoose?: (given: string, correct: boolean) => void
  /** force-reveal the correct answer (e.g. on timeout) */
  revealed?: boolean
  disabled?: boolean
  feedbackMs?: number
  compact?: boolean
}

/** Multiple-choice panel with keyboard 1–4 and colour feedback. Resets whenever the question changes. */
export function QuestionPanel(props: QuestionPanelProps) {
  return <QuestionPanelInner key={`${props.prompt}|${props.options.join('|')}`} {...props} />
}

function QuestionPanelInner({ prompt, options, correct, onAnswer, onChoose, revealed, disabled, feedbackMs = 700, compact }: QuestionPanelProps) {
  const { t } = useTranslation('games')
  const [chosen, setChosen] = useState<string | null>(null)
  const play = useSfx()
  const choose = (opt: string) => {
    if (chosen !== null || disabled) return
    setChosen(opt)
    const ok = opt === correct
    onChoose?.(opt, ok)
    play(ok ? 'correct' : 'wrong')
    window.setTimeout(() => onAnswer(opt, ok), feedbackMs)
  }
  useKeydown((e) => {
    const n = Number(e.key)
    if (n >= 1 && n <= options.length) {
      e.preventDefault()
      choose(options[n - 1])
    }
  }, !disabled && chosen === null)
  return (
    <div className="flex flex-col gap-3">
      <div className={cn('text-center font-semibold', compact ? 'text-base' : 'text-lg sm:text-xl')} aria-live="polite">
        <span className="sr-only">{t('common.question')}: </span>
        {prompt}
      </div>
      <div className={cn('grid gap-2', options.length > 2 && !compact && 'sm:grid-cols-2')}>
        {options.map((opt, i) => {
          const state = chosen === null && !revealed ? 'idle' : opt === correct ? 'correct' : opt === chosen ? 'wrong' : 'dim'
          return (
            <button
              key={`${opt}-${i}`}
              onClick={() => choose(opt)}
              disabled={disabled || chosen !== null || revealed}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                state === 'idle' && 'border-border bg-surface hover:border-primary hover:bg-primary-soft',
                state === 'correct' && 'border-accent bg-accent-soft text-accent',
                state === 'wrong' && 'animate-shake border-error bg-error-soft text-error',
                state === 'dim' && 'border-border opacity-50',
              )}
            >
              <Kbd>{i + 1}</Kbd>
              <span className="min-w-0 flex-1 break-words">{opt}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
