import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Toggle } from '@/ui'
import { GameIllustration } from './GameIllustration'
import type { GameId } from './gameMeta'
import type { BaseGameOptions } from './hooks'

export interface GameIntroProps {
  game: GameId
  onPlay: () => void
  options?: BaseGameOptions
  onOptions?: (patch: Partial<BaseGameOptions>) => void
  /** extra option controls rendered inside the options modal */
  extraOptions?: ReactNode
  /** hide the prompt-side option (e.g. Match uses both sides) */
  hidePromptSide?: boolean
  /** extra content between illustration and title (e.g. ship picker) */
  children?: ReactNode
  disabled?: boolean
  disabledReason?: string
  /** controlled "options open" when the header gear should open it too */
  optionsOpen?: boolean
  onOptionsOpenChange?: (open: boolean) => void
}

export function GameIntro({ game, onPlay, options, onOptions, extraOptions, hidePromptSide, children, disabled, disabledReason, optionsOpen, onOptionsOpenChange }: GameIntroProps) {
  const { t } = useTranslation(['games', 'common'])
  const [howTo, setHowTo] = useState(false)
  const [localOpts, setLocalOpts] = useState(false)
  const optsOpen = optionsOpen ?? localOpts
  const setOptsOpen = (v: boolean) => (onOptionsOpenChange ? onOptionsOpenChange(v) : setLocalOpts(v))
  const name = t(`common:modes.${game}`)
  const steps = t(`games:${game}.howTo`, { returnObjects: true }) as unknown
  const stepList = Array.isArray(steps) ? (steps as string[]) : []
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
      <GameIllustration game={game} className="mb-6 h-32 w-52 drop-shadow-md" />
      {children}
      <h1 className="text-2xl font-extrabold sm:text-3xl">{t('games:common.playGame', { game: name })}</h1>
      <p className="mt-3 max-w-md text-sm text-muted sm:text-base">{t(`games:${game}.rule`)}</p>
      {disabled && disabledReason && <p className="mt-3 rounded-xl bg-error-soft px-4 py-2 text-sm font-medium text-error">{disabledReason}</p>}
      <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <Button size="lg" full onClick={onPlay} disabled={disabled} autoFocus>
          {t('games:common.play')}
        </Button>
        {options && onOptions && (
          <Button variant="outline" full onClick={() => setOptsOpen(true)}>
            {t('common:common.options')}
          </Button>
        )}
        <button className="text-sm font-semibold text-primary hover:underline" onClick={() => setHowTo(true)}>
          {t('games:common.howToPlay', { game: name })}
        </button>
      </div>

      <Modal open={howTo} onClose={() => setHowTo(false)} title={t('games:common.howToPlay', { game: name })} footer={<Button onClick={() => setHowTo(false)}>{t('games:common.gotIt')}</Button>}>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {stepList.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </Modal>

      {options && onOptions && (
        <Modal open={optsOpen} onClose={() => setOptsOpen(false)} title={t('common:common.options')} footer={<Button onClick={() => setOptsOpen(false)}>{t('common:common.done')}</Button>}>
          <GameOptionsForm options={options} onChange={onOptions} hidePromptSide={hidePromptSide}>
            {extraOptions}
          </GameOptionsForm>
        </Modal>
      )}
    </div>
  )
}

export function GameOptionsForm({ options, onChange, hidePromptSide, children }: { options: BaseGameOptions; onChange: (p: Partial<BaseGameOptions>) => void; hidePromptSide?: boolean; children?: ReactNode }) {
  const { t } = useTranslation(['games', 'common'])
  return (
    <div className="divide-y divide-border">
      <Toggle label={t('games:common.starredOnly')} description={t('games:common.starredOnlyDesc')} checked={options.starredOnly} onChange={(v) => onChange({ starredOnly: v })} />
      {!hidePromptSide && (
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <div className="text-sm font-medium">{t('games:common.promptWith')}</div>
            <div className="text-xs text-muted">{t('games:common.promptWithDesc')}</div>
          </div>
          <div className="flex rounded-full bg-surface-2 p-1" role="radiogroup">
            {(['term', 'definition'] as const).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={options.promptSide === s}
                onClick={() => onChange({ promptSide: s })}
                className={`rounded-full px-3 py-1 text-sm font-medium ${options.promptSide === s ? 'bg-surface shadow text-text' : 'text-muted'}`}
              >
                {t(`common:common.${s}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
