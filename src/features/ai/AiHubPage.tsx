import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BookOpenText,
  FileQuestion,
  Headphones,
  MessageCircleQuestion,
  MessageSquareText,
  Sparkles,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { db } from '@/db/db'
import { Modal, cn } from '@/ui'
import { ProviderBanner } from './components/ProviderBanner'
import { AiFooter } from './components/ProviderChip'

interface Tool {
  key: 'generate' | 'chatbotImport' | 'studyGuide' | 'practiceTest' | 'listen' | 'ask'
  icon: LucideIcon
  gradient: string
  to?: string
  needsSet?: boolean
}

const TOOLS: Tool[] = [
  { key: 'generate', icon: WandSparkles, gradient: 'bg-gradient-indigo', to: '/ai/generate' },
  { key: 'chatbotImport', icon: MessageSquareText, gradient: 'bg-gradient-teal', to: '/import/ai' },
  { key: 'studyGuide', icon: BookOpenText, gradient: 'bg-gradient-teal', to: '/ai/study-guide' },
  { key: 'practiceTest', icon: FileQuestion, gradient: 'bg-gradient-orange', to: '/ai/practice-test' },
  { key: 'listen', icon: Headphones, gradient: 'bg-gradient-green', needsSet: true },
  { key: 'ask', icon: MessageCircleQuestion, gradient: 'bg-gradient-indigo', needsSet: true },
]

export default function AiHubPage() {
  const { t } = useTranslation('ai')
  const navigate = useNavigate()
  const [pick, setPick] = useState<Tool | null>(null)
  const sets = useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().limit(30).toArray(), [])

  const openWithSet = (tool: Tool, setId: string) => {
    setPick(null)
    navigate(tool.key === 'listen' ? `/set/${setId}/listen` : `/set/${setId}`)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-indigo text-white">
          <Sparkles size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('hub.title')}</h1>
          <p className="text-sm text-muted">{t('hub.subtitle')}</p>
        </div>
      </header>
      <ProviderBanner />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          const body = (
            <>
              <div className={cn('grid h-11 w-11 place-items-center rounded-xl text-white', tool.gradient)}>
                <Icon size={20} />
              </div>
              <div className="mt-3 text-base font-semibold">{t(`hub.tools.${tool.key}.title`)}</div>
              <p className="mt-1 text-sm text-muted">{t(`hub.tools.${tool.key}.desc`)}</p>
            </>
          )
          const cls = 'card flex flex-col p-5 text-left transition hover:-translate-y-0.5 hover:shadow-pop'
          return tool.to ? (
            <Link key={tool.key} to={tool.to} className={cls}>
              {body}
            </Link>
          ) : (
            <button key={tool.key} type="button" onClick={() => setPick(tool)} className={cls}>
              {body}
            </button>
          )
        })}
      </div>
      <AiFooter />
      <Modal open={!!pick} onClose={() => setPick(null)} title={t('hub.pickSet')} size="sm">
        {sets?.length ? (
          <ul className="divide-y divide-border">
            {sets.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => pick && openWithSet(pick, s.id)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-primary"
                >
                  <span className="truncate">{s.title || '…'}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('hub.noSets')}</p>
        )}
        {pick?.key === 'ask' && <p className="mt-3 text-xs text-muted">{t('hub.askHint')}</p>}
      </Modal>
    </div>
  )
}
