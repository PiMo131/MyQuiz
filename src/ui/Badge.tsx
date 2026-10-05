import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export type BadgeTone = 'neutral' | 'primary' | 'secondary' | 'accent' | 'highlight' | 'error'
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  secondary: 'bg-secondary-soft text-secondary',
  accent: 'bg-accent-soft text-accent',
  highlight: 'bg-highlight-soft text-highlight',
  error: 'bg-error-soft text-error',
}
export function Badge({ tone = 'neutral', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}
      {...rest}
    />
  )
}

export function Chip({ active, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface hover:bg-surface-2',
        className,
      )}
      {...rest}
    />
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted">
      {children}
    </kbd>
  )
}
