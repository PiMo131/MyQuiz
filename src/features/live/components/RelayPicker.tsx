import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Label, Select, Textarea } from '@/ui'
import { LIVE_STRATEGIES, type LiveStrategy } from '../transport'
import { loadCustomRelays, saveCustomRelays } from '../storage'

/** Fallback signalling selector shown when peers cannot find each other. */
export function RelayPicker({ value, onChange }: { value: LiveStrategy; onChange: (s: LiveStrategy) => void }) {
  const { t } = useTranslation('live')
  const [custom, setCustom] = useState(() => loadCustomRelays().join('\n'))
  return (
    <div className="space-y-2">
      <Label htmlFor="live-relays">{t('relays.label')}</Label>
      <Select id="live-relays" value={value} onChange={(e) => onChange(e.target.value as LiveStrategy)}>
        {LIVE_STRATEGIES.map((s) => (
          <option key={s} value={s}>
            {t(`relays.${s}`)}
          </option>
        ))}
      </Select>
      {value === 'custom' && (
        <Textarea
          value={custom}
          placeholder={t('relays.customPlaceholder')}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() => saveCustomRelays(custom.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))}
          aria-label={t('relays.custom')}
        />
      )}
    </div>
  )
}
