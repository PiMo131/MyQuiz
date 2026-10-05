import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Radio } from 'lucide-react'
import { Button, type ButtonProps } from '@/ui'

/** Entry point for the set page: opens the host flow for this set. */
export function LiveLobbyButton({ setId, variant = 'secondary', size = 'md', full }: { setId: string } & Pick<ButtonProps, 'variant' | 'size' | 'full'>) {
  const { t } = useTranslation('live')
  return (
    <Link to={`/live/host/${setId}`} className={full ? 'block' : undefined}>
      <Button variant={variant} size={size} full={full} leftIcon={<Radio size={16} />}>
        {t('button.hostThisSet')}
      </Button>
    </Link>
  )
}
