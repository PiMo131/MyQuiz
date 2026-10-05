import type { ReactNode } from 'react'
import { cn } from '@/ui'

export interface FlipCardProps {
  flipped: boolean
  onFlip: () => void
  front: ReactNode
  back: ReactNode
  /** Rendered in the top corners of both faces (hint, speaker, star). */
  topLeft?: ReactNode
  topRight?: ReactNode
  className?: string
  /** Swipe animation hint for sorting mode. */
  swipe?: 'left' | 'right' | null
  label?: string
}

/** 3D flipping card. Click or Space/Enter flips. */
export function FlipCard({ flipped, onFlip, front, back, topLeft, topRight, className, swipe, label }: FlipCardProps) {
  const face = 'absolute inset-0 flex flex-col rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-8'
  return (
    <div
      className={cn('relative w-full select-none', className)}
      style={{ perspective: '1600px' }}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={flipped}
      onClick={onFlip}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          onFlip()
        }
      }}
    >
      <div
        className={cn(
          'relative h-full w-full transition-transform duration-500 ease-out',
          swipe === 'left' && 'animate-[swipe-left_0.35s_ease-in_forwards]',
          swipe === 'right' && 'animate-[swipe-right_0.35s_ease-in_forwards]',
        )}
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateX(180deg)' : 'rotateX(0deg)' }}
      >
        <div className={face} style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
          <div className="flex items-start justify-between gap-2 text-sm text-muted">
            <div>{topLeft}</div>
            <div className="flex items-center gap-1">{topRight}</div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">{front}</div>
        </div>
        <div className={face} style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}>
          <div className="flex items-start justify-between gap-2 text-sm text-muted">
            <div />
            <div className="flex items-center gap-1">{topRight}</div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">{back}</div>
        </div>
      </div>
      <style>{`@keyframes swipe-left{to{transform:translateX(-120%) rotate(-8deg);opacity:0}}@keyframes swipe-right{to{transform:translateX(120%) rotate(8deg);opacity:0}}`}</style>
    </div>
  )
}
