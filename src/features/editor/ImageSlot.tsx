import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, X } from 'lucide-react'
import { cn } from '@/ui'
import { mediaUrl } from '@/db/repo'

interface Props {
  mediaId?: string
  active: boolean
  onToggle: () => void
  onRemove: () => void
  label: string
}

/** Dashed "Image" button or a thumbnail with remove control. */
export function ImageSlot({ mediaId, active, onToggle, onRemove, label }: Props) {
  const { t } = useTranslation('editor')
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let alive = true
    if (mediaId) void mediaUrl(mediaId).then((u) => alive && setUrl(u))
    else setUrl(undefined)
    return () => {
      alive = false
    }
  }, [mediaId])

  if (mediaId && url) {
    return (
      <div className="relative h-16 w-20 shrink-0">
        <button type="button" onClick={onToggle} className="h-16 w-20 overflow-hidden rounded-xl border border-border bg-surface-2" aria-label={t('image.replace')} title={t('image.replace')}>
          <img src={url} alt="" className="h-full w-full object-cover" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-dark text-white shadow hover:bg-error"
          aria-label={t('image.remove')}
        >
          <X size={12} />
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'flex h-16 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-[11px] font-semibold text-muted transition-colors hover:border-primary hover:text-primary',
        active ? 'border-primary bg-primary-soft text-primary' : 'border-border',
      )}
    >
      <ImagePlus size={18} />
      {t('image.slot')}
    </button>
  )
}
