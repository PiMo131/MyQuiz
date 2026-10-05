import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import QRCode from 'qrcode'
import { db } from '@/db/db'
import { getCards } from '@/db/repo'
import { APP_NAME } from '@/domain/types'
import { encodeSet, shareUrl, URL_WARN_BYTES } from '@/domain/share-codec'
import { fileNameFor, toJson, toSharedSet, type MediaLoader } from '@/domain/import-export/exporters'
import { encryptText } from '@/domain/import-export/crypto'
import { downloadBytes, downloadText } from '@/domain/import-export/files'
import { toast } from '@/ui'

/** QR codes hold ~2950 bytes at level L; keep a margin. */
const QR_MAX = 2300

export const loadMedia: MediaLoader = async (id) => {
  const m = await db.media.get(id)
  return m ? { mime: m.mime, blob: m.blob } : undefined
}

export function appBase(): string {
  return `${location.origin}${location.pathname}`
}

export interface ShareSetApi {
  set: Awaited<ReturnType<typeof db.sets.get>>
  cards: Awaited<ReturnType<typeof getCards>> | undefined
  code: string | undefined
  url: string | undefined
  /** URL is longer than URL_WARN_BYTES: suggest a file instead. */
  tooLong: boolean
  qrDataUrl: string | undefined
  qrTooLong: boolean
  canWebShare: boolean
  embedSnippet: string | undefined
  mailtoUrl: string | undefined
  copyLink: () => Promise<void>
  downloadJson: (passphrase?: string) => Promise<void>
  webShare: () => Promise<void>
}

export function useShareSet(setId: string): ShareSetApi {
  const { t } = useTranslation('share')
  const set = useLiveQuery(() => db.sets.get(setId), [setId])
  const cards = useLiveQuery(() => getCards(setId), [setId])
  const code = useMemo(() => (set && cards ? encodeSet(set, cards) : undefined), [set, cards])
  const url = code ? shareUrl(code, appBase()) : undefined
  const tooLong = !!url && url.length > URL_WARN_BYTES
  const qrTooLong = !!url && url.length > QR_MAX
  const [qr, setQr] = useState<{ url: string; data: string }>()

  useEffect(() => {
    if (!url || url.length > QR_MAX) return
    let alive = true
    void QRCode.toDataURL(url, { errorCorrectionLevel: 'L', margin: 1, width: 512 })
      .then((d) => alive && setQr({ url, data: d }))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [url])

  const copyLink = useCallback(async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('toast.linkCopied'))
    } catch {
      toast.error(t('toast.copyFailed'))
    }
  }, [url, t])

  const downloadJson = useCallback(
    async (passphrase?: string) => {
      if (!set || !cards) return
      const json = toJson(await toSharedSet(set, cards, loadMedia))
      if (passphrase) downloadBytes(await encryptText(json, passphrase), fileNameFor(set.title, 'mqz'), 'application/octet-stream')
      else downloadText(json, fileNameFor(set.title, 'json'), 'application/json')
      toast.success(t('toast.downloaded'))
    },
    [set, cards, t],
  )

  const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const webShare = useCallback(async () => {
    if (!set || !cards || !url || !canWebShare) return
    const title = t('shareTitle', { title: set.title, app: APP_NAME })
    try {
      const json = toJson(await toSharedSet(set, cards, loadMedia))
      const file = new File([json], fileNameFor(set.title, 'json'), { type: 'application/json' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ title, text: title, files: [file] })
      else await navigator.share({ title, text: title, url })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error(t('toast.shareFailed'))
    }
  }, [set, cards, url, canWebShare, t])

  const embedSnippet = code ? `<iframe src="${appBase()}#/embed/${code}" width="100%" height="420" style="border:0;border-radius:16px" loading="lazy" title="${APP_NAME}"></iframe>` : undefined
  const mailtoUrl = set && url ? `mailto:?subject=${encodeURIComponent(t('shareTitle', { title: set.title, app: APP_NAME }))}&body=${encodeURIComponent(t('mailBody', { title: set.title, app: APP_NAME }) + '\n\n' + url)}` : undefined

  return {
    set,
    cards,
    code,
    url,
    tooLong,
    qrDataUrl: qr && qr.url === url ? qr.data : undefined,
    qrTooLong,
    canWebShare,
    embedSnippet,
    mailtoUrl,
    copyLink,
    downloadJson,
    webShare,
  }
}
