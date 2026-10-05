import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState } from '@/ui'
import { Compass } from 'lucide-react'

export function NotFound() {
  const { t } = useTranslation()
  return (
    <EmptyState icon={<Compass />} title={t('common.notFound')} action={<Link to="/"><Button>{t('common.goHome')}</Button></Link>} />
  )
}
