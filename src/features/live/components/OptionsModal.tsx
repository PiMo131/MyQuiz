import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Users } from 'lucide-react'
import type { LiveConfig, MascotTheme } from '@/domain/live/protocol'
import type { Side } from '@/domain/types'
import { Button, Label, Modal, Select, Toggle, cn } from '@/ui'

const MASCOTS: MascotTheme[] = ['animals', 'food', 'space']
const SIDES: Side[] = ['term', 'definition']

export function OptionsModal({ open, onClose, config, onSave, soundOn, onToggleSound }: { open: boolean; onClose: () => void; config: LiveConfig; onSave: (c: Partial<LiveConfig>) => void; soundOn: boolean; onToggleSound: () => void }) {
  const { t } = useTranslation('live')
  const { t: tc } = useTranslation()
  const [draft, setDraft] = useState<LiveConfig>(config)
  useEffect(() => {
    if (open) setDraft(config)
  }, [open, config])
  const set = <K extends keyof LiveConfig>(k: K, v: LiveConfig[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const row = (label: string, hint: string | undefined, control: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
  const numSelect = (value: number, values: number[], onChange: (n: number) => void, fmt: (n: number) => string = String, label?: string) => (
    <Select value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-32" aria-label={label}>
      {values.map((v) => (
        <option key={v} value={v}>
          {fmt(v)}
        </option>
      ))}
    </Select>
  )
  const secs = (n: number) => (n === 0 ? t('options.noLimit') : t('options.seconds', { count: n }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('options.title')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tc('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              onSave(draft)
              onClose()
            }}
          >
            {t('options.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 pb-2">
        {[true, false].map((teams) => (
          <button
            key={String(teams)}
            type="button"
            onClick={() => set('teams', teams)}
            aria-pressed={draft.teams === teams}
            className={cn(
              'flex h-12 items-center justify-center gap-2 rounded-xl border font-semibold',
              draft.teams === teams ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:bg-surface-2',
            )}
          >
            {draft.teams === teams ? <Check size={18} /> : <Users size={18} />}
            {teams ? t('options.teams') : t('options.individuals')}
          </button>
        ))}
      </div>
      <div className="divide-y divide-border">
        {draft.teams && row(t('options.teamCount'), undefined, numSelect(draft.teamCount, [2, 3, 4, 5, 6, 7, 8], (n) => set('teamCount', n), String, t('options.teamCount')))}
        {row(
          t('options.mascot'),
          t('options.mascotHint'),
          <Select value={draft.mascotTheme} onChange={(e) => set('mascotTheme', e.target.value as MascotTheme)} className="w-32" aria-label={t('options.mascot')}>
            {MASCOTS.map((m) => (
              <option key={m} value={m}>
                {t(`options.mascots.${m}`)}
              </option>
            ))}
          </Select>,
        )}
        {draft.mode === 'classic' && row(t('options.fast'), t('options.fastHint'), <Toggle checked={draft.fastMode} onChange={(v) => set('fastMode', v)} />)}
        {draft.mode !== 'match' &&
          row(
            t('options.promptWith'),
            undefined,
            <Select value={draft.promptWith} onChange={(e) => set('promptWith', e.target.value as Side)} className="w-32" aria-label={t('options.promptWith')}>
              {SIDES.map((s) => (
                <option key={s} value={s}>
                  {tc(`common.${s}`)}
                </option>
              ))}
            </Select>,
          )}
        {draft.mode !== 'match' &&
          row(
            t('options.answerWith'),
            undefined,
            <Select value={draft.answerWith} onChange={(e) => set('answerWith', e.target.value as Side)} className="w-32" aria-label={t('options.answerWith')}>
              {SIDES.map((s) => (
                <option key={s} value={s}>
                  {tc(`common.${s}`)}
                </option>
              ))}
            </Select>,
          )}
        {row(t('options.sound'), undefined, <Toggle checked={soundOn} onChange={onToggleSound} />)}
        {(draft.mode === 'classic' || draft.mode === 'match') &&
          row(t('options.winners'), t('options.winnersHint'), numSelect(draft.winners, [1, 2, 3, 5], (n) => set('winners', n), String, t('options.winners')))}
        {draft.mode === 'classic' && row(t('options.inARowTarget'), undefined, numSelect(draft.maxQuestions, [5, 8, 10, 12, 15, 20], (n) => set('maxQuestions', n), String, t('options.inARowTarget')))}
        {draft.mode === 'study' && row(t('options.maxQuestions'), t('options.maxQuestionsHint'), numSelect(draft.maxQuestions, [5, 8, 10, 12, 15, 20, 30], (n) => set('maxQuestions', n), String, t('options.maxQuestions')))}
        {draft.mode === 'blast' && row(t('options.blastSeconds'), undefined, numSelect(draft.blastSeconds, [60, 90, 120, 180], (n) => set('blastSeconds', n), (n) => t('options.seconds', { count: n }), t('options.blastSeconds')))}
        {draft.mode === 'match' && row(t('options.matchPairs'), undefined, numSelect(draft.matchPairs, [4, 6, 8, 10], (n) => set('matchPairs', n), String, t('options.matchPairs')))}
        {draft.mode !== 'match' &&
          row(t('options.timePerQuestion'), undefined, numSelect(draft.timePerQuestion, [0, 5, 10, 15, 20, 30, 45, 60], (n) => set('timePerQuestion', n), secs, t('options.timePerQuestion')))}
      </div>
      <div className="pt-3">
        <Label>{t('host.playAlong')}</Label>
        <Toggle checked={draft.hostPlays} onChange={(v) => set('hostPlays', v)} label={t('host.playAlong')} description={t('host.playAlongHint')} />
      </div>
    </Modal>
  )
}
