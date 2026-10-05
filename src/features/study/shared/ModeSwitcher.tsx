import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  Bomb, BookOpenCheck, ChevronDown, ClipboardList, Gauge, Grid2x2, Home, Layers, Pencil, Puzzle, RefreshCw, Search, Sparkles, SpellCheck, Spline, Type, type LucideIcon,
} from 'lucide-react'
import type { StudyMode } from '@/domain/types'
import { Dropdown, cn } from '@/ui'

export const MODE_ICONS: Record<Exclude<StudyMode, 'live'>, LucideIcon> = {
  flashcards: Layers,
  srs: RefreshCw,
  learn: Sparkles,
  test: ClipboardList,
  write: Pencil,
  spell: SpellCheck,
  match: Puzzle,
  blocks: Grid2x2,
  blast: Bomb,
  charms: Spline,
  hangman: Type,
  wordsearch: BookOpenCheck,
  speedreview: Gauge,
}

export const STUDY_MODES: Array<Exclude<StudyMode, 'live'>> = ['flashcards', 'learn', 'test', 'write', 'spell', 'srs']
export const GAME_MODES: Array<Exclude<StudyMode, 'live'>> = ['match', 'blocks', 'blast', 'charms', 'hangman', 'wordsearch', 'speedreview']

export function modePath(setId: string, mode: StudyMode): string {
  return mode === 'live' ? `/live/host/${setId}` : `/set/${setId}/${mode}`
}

export interface ModeSwitcherProps {
  mode: StudyMode
  setId: string
  className?: string
}

/** "Flashcards ▾" dropdown in the full-screen study header: jump to any other mode of the same set. */
export function ModeSwitcher({ mode, setId, className }: ModeSwitcherProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const Icon = mode === 'live' ? Sparkles : MODE_ICONS[mode]
  const items = [
    ...[...STUDY_MODES, ...GAME_MODES]
      .filter((m) => m !== mode)
      .map((m) => {
        const I = MODE_ICONS[m]
        return { label: t(`modes.${m}`), icon: <I size={16} />, onSelect: () => navigate(modePath(setId, m)) }
      }),
    { divider: true, label: '' },
    { label: t('nav.home'), icon: <Home size={16} />, onSelect: () => navigate('/') },
    { label: t('nav.search'), icon: <Search size={16} />, onSelect: () => navigate('/search') },
  ]
  return (
    <Dropdown
      align="left"
      className={className}
      trigger={
        <button className={cn('flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-surface-2')} aria-label={t('modes.' + mode)}>
          <Icon size={18} className="text-primary" />
          <span className="max-w-28 truncate sm:max-w-44">{t(`modes.${mode}`)}</span>
          <ChevronDown size={16} className="text-muted" />
        </button>
      }
      items={items}
    />
  )
}
