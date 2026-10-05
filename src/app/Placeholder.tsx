import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { Hammer } from 'lucide-react'
import { Button, EmptyState } from '@/ui'

export function Placeholder({ name }: { name: string }) {
  const { t } = useTranslation()
  const params = useParams()
  return (
    <div className="mx-auto max-w-2xl py-10">
      <EmptyState
        icon={<Hammer />}
        title={name}
        description={`${t('common.comingSoon')} ${Object.keys(params).length ? JSON.stringify(params) : ''}`}
        action={<Link to="/"><Button variant="secondary">{t('common.goHome')}</Button></Link>}
      />
    </div>
  )
}
