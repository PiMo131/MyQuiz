import { cn } from '@/ui'

export const AVATARS = ['🦊', '🐼', '🐸', '🦉', '🐙', '🐢', '🦁', '🐧', '🐨', '🦄', '🐯', '🐻', '🐵', '🐰', '🦋', '🐳', '🍕', '🍩', '🌮', '🥑', '🚀', '🪐', '👽', '🤖', '🎸', '⚽', '🎯', '🧠']

export function Avatar({ emoji, size = 'md', color, className }: { emoji: string; size?: 'sm' | 'md' | 'lg' | 'xl'; color?: string; className?: string }) {
  const sizes = { sm: 'h-8 w-8 text-lg', md: 'h-11 w-11 text-2xl', lg: 'h-16 w-16 text-4xl', xl: 'h-24 w-24 text-6xl' }
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full bg-surface-2 leading-none select-none', sizes[size], className)}
      style={color ? { boxShadow: `0 0 0 3px ${color}` } : undefined}
      aria-hidden="true"
    >
      {emoji}
    </span>
  )
}

export function AvatarPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-7 gap-2">
      {AVATARS.map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={value === a}
          aria-label={a}
          onClick={() => onChange(a)}
          className={cn(
            'grid aspect-square place-items-center rounded-xl text-2xl transition hover:bg-surface-2',
            value === a ? 'bg-primary-soft ring-2 ring-primary' : 'bg-surface',
          )}
        >
          {a}
        </button>
      ))}
    </div>
  )
}
