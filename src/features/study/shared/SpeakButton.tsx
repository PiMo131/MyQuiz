import { Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { speak } from '@/features/tts'
import { useSettings } from '@/app/settings-store'
import { cn } from '@/ui'

/** Icon button that reads `text` aloud with the browser's speech synthesis. */
export function SpeakButton({ text, lang, size = 18, className, rate }: { text: string; lang?: string; size?: number; className?: string; rate?: number }) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  return (
    <button
      type="button"
      aria-label={t('common.textToSpeech')}
      title={t('common.textToSpeech')}
      onClick={(e) => {
        e.stopPropagation()
        speak(text, lang || undefined, { rate: rate ?? settings.tts.rate })
      }}
      className={cn('rounded-full p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text', className)}
    >
      <Volume2 size={size} />
    </button>
  )
}
