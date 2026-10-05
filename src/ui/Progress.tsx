import { cn } from './cn'

export function ProgressBar({ value, max = 100, tone = 'primary', className, segments }: { value: number; max?: number; tone?: 'primary' | 'accent' | 'highlight' | 'error' | 'secondary'; className?: string; segments?: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const color = { primary: 'bg-primary', accent: 'bg-accent', highlight: 'bg-highlight', error: 'bg-error', secondary: 'bg-secondary' }[tone]
  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cn('h-full rounded-full transition-[width] duration-300', color)} style={{ width: `${pct}%` }} />
      {segments && segments > 1 && (
        <div className="absolute inset-0 flex">
          {Array.from({ length: segments - 1 }).map((_, i) => (
            <div key={i} className="h-full flex-1 border-r-2 border-bg" />
          ))}
          <div className="h-full flex-1" />
        </div>
      )}
    </div>
  )
}

export function Ring({ value, size = 56, stroke = 6, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-surface-2)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-primary)" strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      {label && (
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="rotate-90 origin-center fill-current text-xs font-bold">
          {label}
        </text>
      )}
    </svg>
  )
}
