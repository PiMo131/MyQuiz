import { cn } from './cn'

export interface TabItem<T extends string> { value: T; label: React.ReactNode; count?: number }

export function Tabs<T extends string>({ items, value, onChange, className, variant = 'pill' }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string; variant?: 'pill' | 'underline' }) {
  return (
    <div className={cn('no-scrollbar flex gap-2 overflow-x-auto', variant === 'underline' && 'gap-0 border-b border-border', className)} role="tablist">
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'whitespace-nowrap text-sm font-medium transition-colors',
              variant === 'pill' && 'rounded-full border px-3.5 py-1.5',
              variant === 'pill' && (active ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:bg-surface-2'),
              variant === 'underline' && '-mb-px border-b-2 px-3 py-2',
              variant === 'underline' && (active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text'),
            )}
          >
            {it.label}
            {it.count !== undefined && <span className="ml-1.5 text-xs text-muted">{it.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
