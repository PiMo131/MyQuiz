import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardPaste, Link2, Upload } from 'lucide-react'
import { Button, Input, cn, toast } from '@/ui'
import { imageFileFrom, storeImage, storeImageFromUrl } from './image-utils'

interface Props {
  title: string
  onPicked: (mediaId: string) => void
  onClose: () => void
  /** Imperative hook so the parent can trigger the file dialog (Ctrl+Shift+U). */
  fileInputRef?: React.RefObject<HTMLInputElement | null>
}

/** Upload / URL / drag-and-drop / clipboard panel for one card side. */
export function ImagePanel({ title, onPicked, onClose, fileInputRef }: Props) {
  const { t } = useTranslation('editor')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const localRef = useRef<HTMLInputElement>(null)
  const inputRef = fileInputRef ?? localRef

  const handleFile = async (file: Blob | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('image.notAnImage'))
      return
    }
    setBusy(true)
    try {
      const m = await storeImage(file)
      onPicked(m.id)
      onClose()
    } catch {
      toast.error(t('image.failed'))
    } finally {
      setBusy(false)
    }
  }
  const handleUrl = async () => {
    const u = url.trim()
    if (!u) return
    setBusy(true)
    try {
      const m = await storeImageFromUrl(u)
      onPicked(m.id)
      onClose()
    } catch {
      toast.error(t('image.urlFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn('mt-3 rounded-xl border border-dashed p-4 transition-colors', over ? 'border-primary bg-primary-soft' : 'border-border bg-surface-2/50')}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = imageFileFrom(e.dataTransfer)
        if (f) void handleFile(f)
        else {
          const u = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
          if (u && /^https?:\/\//.test(u)) {
            setUrl(u)
          }
        }
      }}
      onPaste={(e) => {
        const f = imageFileFrom(e.clipboardData)
        if (f) {
          e.preventDefault()
          void handleFile(f)
        }
      }}
    >
      <div className="mb-3 text-sm font-semibold">{title}</div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleUrl()}
            placeholder={t('image.urlPlaceholder')}
            className="pl-9"
            aria-label={t('image.urlPlaceholder')}
          />
        </div>
        <Button variant="secondary" onClick={() => void handleUrl()} disabled={!url.trim() || busy} loading={busy}>
          {t('image.addUrl')}
        </Button>
        <span className="text-center text-xs text-muted">{t('image.or')}</span>
        <Button leftIcon={<Upload size={16} />} onClick={() => inputRef.current?.click()} disabled={busy}>
          {t('image.upload')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={t('image.upload')}
          onChange={(e) => {
            void handleFile(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <ClipboardPaste size={13} />
        {t('image.dropHint')}
      </p>
    </div>
  )
}
