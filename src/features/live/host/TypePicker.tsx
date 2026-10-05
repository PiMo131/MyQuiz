import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { LIVE_MODES, type LiveConfig, type LiveMode } from '@/domain/live/protocol'
import { cn } from '@/ui'

const ART: Record<LiveMode, { gradient: string; emoji: string }> = {
  classic: { gradient: 'bg-gradient-indigo', emoji: '🏁' },
  match: { gradient: 'bg-gradient-teal', emoji: '🧩' },
  blast: { gradient: 'bg-gradient-orange', emoji: '💥' },
  study: { gradient: 'bg-gradient-green', emoji: '🤝' },
}

export function TypePicker({ config, onPick }: { config: LiveConfig; onPick: (mode: LiveMode) => void }) {
  const { t } = useTranslation('live')
  const [how, setHow] = useState<LiveMode | null>(null)
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <h1 className="text-center text-3xl font-black sm:text-5xl">{t('host.chooseType')}</h1>
      <p className="mx-auto mt-3 max-w-2xl text-center text-base text-muted sm:text-lg">{t('host.chooseTypeSub')}</p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {LIVE_MODES.map((m) => (
          <div key={m} className="flex flex-col gap-3">
            <button
              onClick={() => onPick(m)}
              className="card group flex flex-col overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-pop focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className={cn('grid h-36 place-items-center text-7xl', ART[m].gradient)} aria-hidden="true">
                <span className="transition group-hover:scale-110">{ART[m].emoji}</span>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-2 text-xl font-bold">
                  {t(`modes.${m}.name`)}
                  <ChevronRight className="text-muted" />
                </div>
                <p className="mt-1 text-sm text-muted">{t(`modes.${m}.desc`, { count: config.maxQuestions, seconds: config.blastSeconds })}</p>
              </div>
            </button>
            <button className="text-sm font-semibold text-primary hover:underline" onClick={() => setHow(how === m ? null : m)} aria-expanded={how === m}>
              {t('host.howToPlay')}
            </button>
            {how === m && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted animate-pop">{t(`modes.${m}.desc`, { count: config.maxQuestions, seconds: config.blastSeconds })}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
