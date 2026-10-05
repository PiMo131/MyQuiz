import { type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Settings, Volume2, VolumeX, X } from 'lucide-react'
import { Dropdown } from '@/ui'
import { useSettings } from '@/app/settings-store'
import { GAMES, STUDY_MODES, type GameId } from './gameMeta'
import { GameIcon } from './GameIcon'

export interface GameHeaderProps {
  setId: string
  game: GameId
  /** centre content: set title or timer */
  center?: ReactNode
  onOptions?: () => void
  onClose?: () => void
  /** extra button(s) before the close button */
  extra?: ReactNode
}

/** Full-screen game header: mode switcher left, title/timer centre, sound/options/close right. */
export function GameHeader({ setId, game, center, onOptions, onClose, extra }: GameHeaderProps) {
  const { t } = useTranslation(['common', 'games'])
  const navigate = useNavigate()
  const sounds = useSettings((s) => s.settings.sounds)
  const update = useSettings((s) => s.update)
  const items = [
    ...STUDY_MODES.map((m) => ({ label: t(`common:modes.${m}`), onSelect: () => navigate(`/set/${setId}/${m}`) })),
    { divider: true, label: '' },
    ...GAMES.map((g) => ({
      label: (
        <span className="flex items-center gap-2">
          <GameIcon game={g.id} size={16} /> {t(`common:modes.${g.id}`)}
        </span>
      ),
      onSelect: () => navigate(`/set/${setId}/${g.id}`),
      disabled: g.id === game,
    })),
  ]
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 sm:px-4">
      <Dropdown
        align="left"
        trigger={
          <button className="flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-semibold hover:bg-surface-2" aria-label={t('games:common.switchMode')} aria-haspopup="menu">
            <GameIcon game={game} size={20} />
            <span className="hidden sm:inline">{t(`common:modes.${game}`)}</span>
            <ChevronDown size={16} className="text-muted" />
          </button>
        }
        items={items}
      />
      <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold" aria-live="polite">
        {center}
      </div>
      <div className="flex items-center gap-1">
        {extra}
        <button
          className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text"
          aria-label={sounds ? t('games:common.soundOff') : t('games:common.soundOn')}
          aria-pressed={sounds}
          onClick={() => void update({ sounds: !sounds })}
        >
          {sounds ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
        {onOptions && (
          <button className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label={t('common:common.options')} onClick={onOptions}>
            <Settings size={20} />
          </button>
        )}
        {onClose ? (
          <button className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label={t('common:common.close')} onClick={onClose}>
            <X size={22} />
          </button>
        ) : (
          <Link to={`/set/${setId}`} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label={t('common:common.close')}>
            <X size={22} />
          </Link>
        )}
      </div>
    </header>
  )
}
