import { useTranslation } from 'react-i18next'
import { ListPlus, Scan, Trash2 } from 'lucide-react'
import { Input, Label, Textarea, Toggle } from '@/ui'
import { TagsInput } from './TagsInput'
import type { EditorCard } from './editor-state'

interface Props {
  card: EditorCard
  onChange: (patch: Partial<EditorCard>) => void
  onOcclusion: () => void
}

/** Expandable per-card extras: hint, mnemonic, example, alternative answers, distractors, cloze mode, occlusion. */
export function ExtrasPanel({ card, onChange, onOcclusion }: Props) {
  const { t } = useTranslation('editor')
  const imageId = card.image.term ?? card.image.definition
  return (
    <div className="mt-4 grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <Label htmlFor={`hint-${card.id}`}>{t('extras.hint')}</Label>
          <Input id={`hint-${card.id}`} value={card.hint} onChange={(e) => onChange({ hint: e.target.value })} placeholder={t('extras.hintPlaceholder')} />
        </div>
        <div>
          <Label htmlFor={`mnemonic-${card.id}`}>{t('extras.mnemonic')}</Label>
          <Input id={`mnemonic-${card.id}`} value={card.mnemonic} onChange={(e) => onChange({ mnemonic: e.target.value })} placeholder={t('extras.mnemonicPlaceholder')} />
        </div>
        <div>
          <Label htmlFor={`example-${card.id}`}>{t('extras.example')}</Label>
          <Textarea id={`example-${card.id}`} value={card.example} onChange={(e) => onChange({ example: e.target.value })} placeholder={t('extras.examplePlaceholder')} className="min-h-16" />
        </div>
        <div>
          <Label>{t('extras.altAnswers')}</Label>
          <TagsInput value={card.altAnswers} onChange={(altAnswers) => onChange({ altAnswers })} placeholder={t('extras.altAnswersPlaceholder')} label={t('extras.altAnswers')} />
          <p className="mt-1 text-xs text-muted">{t('extras.altAnswersHelp')}</p>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <Label>{t('extras.multipleChoice')}</Label>
          {card.distractors ? (
            <div className="space-y-2">
              {card.distractors.map((d, i) => (
                <Input
                  key={i}
                  value={d}
                  onChange={(e) => onChange({ distractors: card.distractors!.map((x, j) => (j === i ? e.target.value : x)) })}
                  placeholder={t('extras.optionPlaceholder', { n: i + 1 })}
                  aria-label={t('extras.optionPlaceholder', { n: i + 1 })}
                />
              ))}
              <button type="button" onClick={() => onChange({ distractors: null })} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                <Trash2 size={14} />
                {t('extras.removeOptions')}
              </button>
              <p className="text-xs text-muted">{t('extras.multipleChoiceHelp')}</p>
            </div>
          ) : (
            <button type="button" onClick={() => onChange({ distractors: ['', '', ''] })} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              <ListPlus size={16} />
              {t('extras.addOptions')}
            </button>
          )}
        </div>
        <Toggle
          checked={card.cloze !== null}
          onChange={(v) => onChange({ cloze: v ? card.cloze ?? card.term : null })}
          label={t('extras.clozeMode')}
          description={t('extras.clozeHelp')}
        />
        {imageId && (
          <button type="button" onClick={onOcclusion} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-semibold hover:bg-surface-2">
            <Scan size={16} />
            {card.occlusion?.rects.length ? t('extras.editOcclusion', { count: card.occlusion.rects.length }) : t('extras.addOcclusion')}
          </button>
        )}
      </div>
    </div>
  )
}
