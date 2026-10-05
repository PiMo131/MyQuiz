import { useEffect, useState } from 'react'
import { cn } from '@/ui'

/** Shrinking bar until `deadlineAt` (host clock); `offset` = host − local clock. */
export function TimerBar({ deadlineAt, startedAt, offset = 0, className, big }: { deadlineAt: number | null; startedAt: number; offset?: number; className?: string; big?: boolean }) {
  const [now, setNow] = useState(() => Date.now() + offset)
  useEffect(() => {
    if (deadlineAt === null) return
    const id = setInterval(() => setNow(Date.now() + offset), 100)
    return () => clearInterval(id)
  }, [deadlineAt, offset])
  if (deadlineAt === null) return null
  const total = Math.max(1, deadlineAt - startedAt)
  const left = Math.max(0, deadlineAt - now)
  const pct = (left / total) * 100
  const secs = Math.ceil(left / 1000)
  return (
    <div className={cn('flex items-center gap-3', className)} aria-live="off">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full rounded-full transition-[width] duration-100', pct < 25 ? 'bg-error' : pct < 50 ? 'bg-highlight' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('tabular-nums font-bold', big ? 'text-3xl' : 'text-sm', pct < 25 && 'text-error')}>{secs}</span>
    </div>
  )
}

export function useCountdown(target: number | null, offset = 0): number {
  const [left, setLeft] = useState(() => (target === null ? 0 : Math.max(0, target - (Date.now() + offset))))
  useEffect(() => {
    if (target === null) return
    const tick = () => setLeft(Math.max(0, target - (Date.now() + offset)))
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [target, offset])
  return target === null ? 0 : left
}

export function formatMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
