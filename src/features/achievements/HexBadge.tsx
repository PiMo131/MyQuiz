import { cn } from '@/ui'

/** Hexagon badge with an emoji icon; coloured when earned, grey when locked. */
export function HexBadge({ icon, earned, size = 88, className }: { icon: string; earned: boolean; size?: number; className?: string }) {
  return (
    <div className={cn('relative grid place-items-center', className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0">
        <defs>
          <linearGradient id="hex-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#06b6da" />
          </linearGradient>
        </defs>
        <polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill={earned ? 'url(#hex-grad)' : 'var(--color-surface-2)'} stroke={earned ? '#4f52e6' : 'var(--color-border)'} strokeWidth="3" strokeLinejoin="round" />
        <polygon points="50,14 83,33 83,67 50,86 17,67 17,33" fill={earned ? 'rgba(255,255,255,0.14)' : 'transparent'} />
      </svg>
      <span className={cn('relative text-3xl drop-shadow', !earned && 'opacity-40 grayscale')} style={{ fontSize: size * 0.38 }}>{icon}</span>
    </div>
  )
}
