import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/ui'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  label: string
  className?: string
}

/** Chip-style tags input. Enter, comma or blur adds; Backspace on empty removes the last. */
export function TagsInput({ value, onChange, placeholder, label, className }: Props) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean)
    if (!parts.length) return
    const next = [...value]
    for (const p of parts) if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p)
    onChange(next)
    setText('')
  }
  return (
    <div className={cn('flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30', className)}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
          #{tag}
          <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} className="rounded-full hover:bg-primary/20" aria-label={`${label}: ${tag} ×`}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(text)
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => add(text)}
        placeholder={value.length ? '' : placeholder}
        aria-label={label}
        className="min-w-24 flex-1 bg-transparent py-1 text-sm placeholder:text-faint focus:outline-none"
      />
    </div>
  )
}
