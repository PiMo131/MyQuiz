import { useEffect } from 'react'
import { Circle, Diamond, Square, Triangle } from 'lucide-react'
import { cn } from '@/ui'

export const OPTION_STYLES = [
  { bg: 'bg-[#e21b3c]', Icon: Triangle },
  { bg: 'bg-[#1368ce]', Icon: Diamond },
  { bg: 'bg-[#d89e00]', Icon: Circle },
  { bg: 'bg-[#26890c]', Icon: Square },
]

export interface AnswerButtonsProps {
  options: string[]
  onPick?: (i: number) => void
  disabled?: boolean
  picked?: number | null
  correct?: number | null
  /** when true, number keys 1–4 pick an option */
  keyboard?: boolean
  size?: 'md' | 'lg'
  counts?: number[] | null
}

/** Colour- and shape-coded answer grid (players), also used read-only on the host screen. */
export function AnswerButtons({ options, onPick, disabled, picked = null, correct = null, keyboard = true, size = 'md', counts = null }: AnswerButtonsProps) {
  useEffect(() => {
    if (!keyboard || disabled || !onPick) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const n = Number(e.key)
      if (n >= 1 && n <= options.length) {
        e.preventDefault()
        onPick(n - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboard, disabled, onPick, options.length])
  const total = counts ? counts.reduce((a, b) => a + b, 0) : 0
  return (
    <div className={cn('grid gap-2 sm:gap-3', options.length > 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
      {options.map((o, i) => {
        const st = OPTION_STYLES[i % OPTION_STYLES.length]
        const revealed = correct !== null
        const isCorrect = revealed && i === correct
        const isWrongPick = revealed && picked === i && i !== correct
        return (
          <button
            key={i}
            type="button"
            disabled={disabled || !onPick}
            onClick={() => onPick?.(i)}
            aria-label={`${i + 1}. ${o}`}
            className={cn(
              'relative flex min-h-16 items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-left font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-default',
              size === 'lg' ? 'min-h-24 text-xl sm:text-2xl' : 'text-base sm:text-lg',
              st.bg,
              revealed && !isCorrect && 'opacity-40',
              isCorrect && 'ring-4 ring-white/80',
              isWrongPick && 'opacity-80 ring-4 ring-error',
              picked === i && !revealed && 'ring-4 ring-white/80',
            )}
          >
            {counts && total > 0 && <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${(counts[i] / total) * 100}%` }} aria-hidden="true" />}
            <st.Icon size={size === 'lg' ? 28 : 22} className="relative shrink-0 fill-current" aria-hidden="true" />
            <span className="relative min-w-0 flex-1 break-words">{o}</span>
            {counts && <span className="relative text-sm tabular-nums opacity-90">{counts[i]}</span>}
            <kbd className="relative hidden rounded-md bg-black/20 px-1.5 text-xs sm:inline" aria-hidden="true">
              {i + 1}
            </kbd>
          </button>
        )
      })}
    </div>
  )
}
