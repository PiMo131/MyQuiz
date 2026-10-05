import { Gem, Grid3x3, LayoutGrid, Rocket, Search, Timer, type LucideProps } from 'lucide-react'
import type { GameId } from './gameMeta'

function Gallows(props: LucideProps) {
  const { size = 24, ...rest } = props
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M4 21h8M7 21V3h9v3" />
      <circle cx="16" cy="9.5" r="2.5" />
      <path d="M16 12v5M16 14l-2 2M16 14l2 2" />
    </svg>
  )
}

const icons = {
  match: LayoutGrid,
  blocks: Grid3x3,
  blast: Rocket,
  charms: Gem,
  hangman: Gallows,
  wordsearch: Search,
  speedreview: Timer,
}

const colors: Record<GameId, string> = {
  match: 'text-primary',
  blocks: 'text-secondary',
  blast: 'text-primary',
  charms: 'text-highlight',
  hangman: 'text-accent',
  wordsearch: 'text-secondary',
  speedreview: 'text-error',
}

export function GameIcon({ game, size = 20, className = '' }: { game: GameId; size?: number; className?: string }) {
  const Icon = icons[game]
  return <Icon size={size} className={`${colors[game]} ${className}`} aria-hidden />
}
