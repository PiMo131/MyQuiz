import { useTranslation } from 'react-i18next'
import { ProgressBar } from '@/ui'

/** Remaining / Incorrect / Correct bars (Write & Spell side panel). */
export function StatBars({ remaining, incorrect, correct, total }: { remaining: number; incorrect: number; correct: number; total: number }) {
  const { t } = useTranslation('study')
  const max = Math.max(1, total)
  const rows: Array<[string, number, 'primary' | 'error' | 'accent']> = [
    [t('write.remaining'), remaining, 'primary'],
    [t('common:common.incorrect'), incorrect, 'error'],
    [t('common:common.correct'), correct, 'accent'],
  ]
  return (
    <div className="space-y-3">
      {rows.map(([label, value, tone]) => (
        <div key={label}>
          <ProgressBar value={value} max={max} tone={tone} className="h-2.5" />
          <div className="mt-1 flex items-center justify-between text-xs font-semibold">
            <span className="text-muted">{label}</span>
            <span>{value}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
