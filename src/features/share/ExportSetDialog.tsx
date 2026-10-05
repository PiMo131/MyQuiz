import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Copy, Download } from 'lucide-react'
import { db } from '@/db/db'
import { getCards } from '@/db/repo'
import { Button, Input, Modal, Toggle, toast } from '@/ui'
import { EXPORT_FORMATS, exportSet, fileNameFor, type ExportFormat, type QuizletTextOptions } from '@/domain/import-export/exporters'
import { encryptText } from '@/domain/import-export/crypto'
import { downloadBytes, downloadText } from '@/domain/import-export/files'
import { loadMedia } from './useShareSet'

export interface ExportSetDialogProps {
  open: boolean
  onClose: () => void
  setId: string
}

export function ExportSetDialog({ open, onClose, setId }: ExportSetDialogProps) {
  const { t } = useTranslation('share')
  const set = useLiveQuery(() => db.sets.get(setId), [setId])
  const cards = useLiveQuery(() => getCards(setId), [setId])
  const [format, setFormat] = useState<ExportFormat>('json')
  const [quizlet, setQuizlet] = useState<QuizletTextOptions>({ termSep: 'tab', cardSep: 'newline', customTermSep: ' - ', customCardSep: '\n\n' })
  const [encrypt, setEncrypt] = useState(false)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)

  const mustEncrypt = set?.visibility === 'password'
  const encrypting = encrypt || mustEncrypt
  const passOk = !encrypting || (pass.length >= 4 && pass === pass2)

  const previewText = useMemo(() => {
    if (!set || !cards) return ''
    return exportSet(format, set, cards.slice(0, 20), { quizlet })
  }, [set, cards, format, quizlet])
  useEffect(() => {
    let alive = true
    if (previewText) void previewText.then((r) => alive && setPreview(r.text.slice(0, 1200)))
    return () => {
      alive = false
    }
  }, [previewText])

  const build = async () => {
    if (!set || !cards) return undefined
    return exportSet(format, set, cards, { loadMedia, quizlet })
  }
  const download = async () => {
    setBusy(true)
    try {
      const r = await build()
      if (!r) return
      if (encrypting) downloadBytes(await encryptText(r.text, pass), fileNameFor(set!.title, 'mqz'))
      else downloadText(r.text, r.fileName, `${r.mime};charset=utf-8`)
      toast.success(t('toast.downloaded'))
      onClose()
    } catch {
      toast.error(t('toast.exportFailed'))
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      const r = await build()
      if (!r) return
      await navigator.clipboard.writeText(r.text)
      toast.success(t('toast.copied'))
    } catch {
      toast.error(t('toast.copyFailed'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('export.title')}
      footer={
        <>
          <Button variant="ghost" leftIcon={<Copy size={16} />} onClick={() => void copy()} disabled={!cards || encrypting}>
            {t('export.copy')}
          </Button>
          <Button leftIcon={<Download size={16} />} onClick={() => void download()} disabled={!cards || !passOk} loading={busy}>
            {t('export.download')}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[13rem_1fr]">
        <fieldset className="space-y-1">
          <legend className="mb-2 text-sm font-semibold">{t('export.format')}</legend>
          {EXPORT_FORMATS.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
              <input type="radio" name="fmt" checked={format === f.id} onChange={() => setFormat(f.id)} className="mt-1 accent-primary" />
              <span>
                <span className="font-medium">{t(`export.formats.${f.id}`)}</span>
                <span className="block text-xs text-muted">{t(`export.formatHelp.${f.id}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="space-y-4">
          {format === 'quizlet' && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="space-y-1">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{t('export.betweenSides')}</span>
                <select value={quizlet.termSep} onChange={(e) => setQuizlet({ ...quizlet, termSep: e.target.value as QuizletTextOptions['termSep'] })} className="w-full rounded-xl border border-border bg-surface px-3 py-2">
                  <option value="tab">{t('export.tab')}</option>
                  <option value="comma">{t('export.comma')}</option>
                  <option value="custom">{t('export.custom')}</option>
                </select>
                {quizlet.termSep === 'custom' && <Input value={quizlet.customTermSep ?? ''} onChange={(e) => setQuizlet({ ...quizlet, customTermSep: e.target.value })} className="font-mono" aria-label={t('export.custom')} />}
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{t('export.betweenCards')}</span>
                <select value={quizlet.cardSep} onChange={(e) => setQuizlet({ ...quizlet, cardSep: e.target.value as QuizletTextOptions['cardSep'] })} className="w-full rounded-xl border border-border bg-surface px-3 py-2">
                  <option value="newline">{t('export.newline')}</option>
                  <option value="semicolon">{t('export.semicolon')}</option>
                  <option value="custom">{t('export.custom')}</option>
                </select>
                {quizlet.cardSep === 'custom' && (
                  <Input value={(quizlet.customCardSep ?? '').replace(/\n/g, '\\n')} onChange={(e) => setQuizlet({ ...quizlet, customCardSep: e.target.value.replace(/\\n/g, '\n') })} className="font-mono" aria-label={t('export.custom')} />
                )}
              </label>
            </div>
          )}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('export.preview')}</div>
            <pre className="max-h-48 overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap break-words scrollbar-thin">{preview || '…'}</pre>
          </div>
          <div className="rounded-xl border border-border p-3">
            <Toggle checked={encrypting} onChange={setEncrypt} disabled={mustEncrypt} label={t('export.encrypt')} description={mustEncrypt ? t('export.encryptForced') : t('export.encryptHelp')} />
            {encrypting && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t('export.passphrase')} aria-label={t('export.passphrase')} autoComplete="new-password" />
                <Input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder={t('export.passphraseRepeat')} aria-label={t('export.passphraseRepeat')} autoComplete="new-password" />
                {!passOk && (pass || pass2) && <p className="text-xs text-error sm:col-span-2">{t('export.passphraseMismatch')}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
