import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, Check, Code2, Copy, Download, FileDown, Mail, Share2, TriangleAlert } from 'lucide-react'
import { Button, Dropdown, Modal, cn, toast } from '@/ui'
import { formatBytes } from '@/domain/import-export/files'
import { URL_WARN_BYTES } from '@/domain/share-codec'
import { useShareSet } from './useShareSet'
import { CalendarMenuItems } from './calendar'
import { ExportSetDialog } from './ExportSetDialog'

export interface ShareModalProps {
  open: boolean
  onClose: () => void
  setId: string
}

export function ShareModal({ open, onClose, setId }: ShareModalProps) {
  const { t } = useTranslation('share')
  const s = useShareSet(setId)
  const [embedOpen, setEmbedOpen] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const copyEmbed = async () => {
    if (!s.embedSnippet) return
    try {
      await navigator.clipboard.writeText(s.embedSnippet)
      setCopiedEmbed(true)
      setTimeout(() => setCopiedEmbed(false), 1500)
    } catch {
      toast.error(t('toast.copyFailed'))
    }
  }
  const downloadQr = () => {
    if (!s.qrDataUrl || !s.set) return
    const a = document.createElement('a')
    a.href = s.qrDataUrl
    a.download = `${s.set.title || 'myquizz'}-qr.png`
    a.click()
  }
  const onDownloadJson = () => {
    if (s.set?.visibility === 'password') setExportOpen(true)
    else void s.downloadJson()
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={t('modal.title')} size="lg">
        {!s.set || !s.cards ? (
          <div className="py-10 text-center text-sm text-muted">{t('common:common.loading')}</div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-muted">
              {t('modal.subtitle', { title: s.set.title })} · {t('common:common.cards', { count: s.cards.length })}
            </p>

            {/* Link */}
            <div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input readOnly value={s.url ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label={t('modal.link')} className="h-11 min-w-0 flex-1 truncate rounded-xl border border-border bg-surface-2 px-3.5 text-sm" />
                <Button leftIcon={<Copy size={16} />} onClick={() => void s.copyLink()} disabled={!s.url}>
                  {t('modal.copyLink')}
                </Button>
              </div>
              {s.tooLong && (
                <p className="mt-2 flex items-start gap-2 rounded-xl bg-highlight-soft p-3 text-xs text-highlight">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                  <span>{t('modal.tooLong', { size: formatBytes(s.url?.length ?? 0), max: formatBytes(URL_WARN_BYTES) })}</span>
                </p>
              )}
            </div>

            {/* QR + actions */}
            <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
              <div className="flex flex-col items-center gap-2">
                {s.qrDataUrl ? (
                  <img src={s.qrDataUrl} alt={t('modal.qrAlt')} className="h-36 w-36 rounded-xl border border-border bg-white p-1" />
                ) : (
                  <div className="grid h-36 w-36 place-items-center rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">{s.qrTooLong ? t('modal.qrTooLong') : '…'}</div>
                )}
                <Button variant="ghost" size="sm" leftIcon={<Download size={14} />} onClick={downloadQr} disabled={!s.qrDataUrl}>
                  {t('modal.downloadQr')}
                </Button>
              </div>
              <div className="grid content-start gap-2 sm:grid-cols-2">
                <Button variant="outline" leftIcon={<FileDown size={16} />} onClick={onDownloadJson}>
                  {t('modal.downloadJson')}
                </Button>
                {s.canWebShare && (
                  <Button variant="outline" leftIcon={<Share2 size={16} />} onClick={() => void s.webShare()}>
                    {t('modal.webShare')}
                  </Button>
                )}
                <a href={s.mailtoUrl} className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:bg-surface-2', !s.mailtoUrl && 'pointer-events-none opacity-50')}>
                  <Mail size={16} />
                  {t('modal.email')}
                </a>
                <Dropdown
                  align="left"
                  className="w-full"
                  trigger={
                    <Button variant="outline" leftIcon={<CalendarPlus size={16} />} full>
                      {t('calendar.button')}
                    </Button>
                  }
                  items={CalendarMenuItems(setId, s.set.title)}
                />
                <Button variant="outline" leftIcon={<Code2 size={16} />} onClick={() => setEmbedOpen((o) => !o)} aria-expanded={embedOpen}>
                  {t('modal.embed')}
                </Button>
                <Button variant="ghost" onClick={() => setExportOpen(true)}>
                  {t('modal.moreFormats')}
                </Button>
              </div>
            </div>

            {embedOpen && s.embedSnippet && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t('modal.embedLabel')}</span>
                  <Button variant="ghost" size="sm" leftIcon={copiedEmbed ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copyEmbed()}>
                    {copiedEmbed ? t('common:common.copied') : t('common:common.copy')}
                  </Button>
                </div>
                <textarea readOnly value={s.embedSnippet} onFocus={(e) => e.currentTarget.select()} rows={3} aria-label={t('modal.embedLabel')} className="w-full rounded-xl border border-border bg-surface-2 p-3 font-mono text-xs" />
                <p className="mt-1 text-xs text-muted">{t('modal.embedHelp')}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
      <ExportSetDialog open={exportOpen} onClose={() => setExportOpen(false)} setId={setId} />
    </>
  )
}
