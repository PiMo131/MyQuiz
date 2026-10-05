import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, Download, Upload } from 'lucide-react'
import { Button, Card, CardTitle, Input, Modal, ProgressBar, Toggle, toast } from '@/ui'
import { backupFileName, createBackupZip, readBackup, restoreBackup, type BackupBundle, type BackupProgress, type RestoreMode } from '@/domain/import-export/backup'
import { downloadBytes, formatBytes, readFileBytes } from '@/domain/import-export/files'

/** Settings → Backup: export a ZIP backup (optionally encrypted) and restore one (merge or replace). */
export function BackupPanel() {
  const { t } = useTranslation('share')
  const [encrypt, setEncrypt] = useState(false)
  const [pass, setPass] = useState('')
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ bytes: Uint8Array; name: string } | null>(null)
  const [needPass, setNeedPass] = useState(false)
  const [importPass, setImportPass] = useState('')
  const [bundle, setBundle] = useState<BackupBundle | null>(null)
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportBackup = async () => {
    if (encrypt && pass.length < 4) {
      toast.error(t('backup.passTooShort'))
      return
    }
    setBusy(true)
    try {
      const zip = await createBackupZip({ passphrase: encrypt ? pass : undefined, onProgress: setProgress })
      downloadBytes(zip, backupFileName(encrypt), encrypt ? 'application/octet-stream' : 'application/zip')
      toast.success(t('backup.exported', { size: formatBytes(zip.length) }))
    } catch {
      toast.error(t('backup.exportFailed'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const readPending = async (bytes: Uint8Array, name: string, passphrase?: string) => {
    setBusy(true)
    try {
      const b = await readBackup(bytes, { passphrase, onProgress: setProgress })
      setBundle(b)
      setNeedPass(false)
      setPending({ bytes, name })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'needPassphrase') {
        setPending({ bytes, name })
        setNeedPass(true)
      } else if (msg === 'wrongPassphrase') toast.error(t('backup.wrongPass'))
      else toast.error(t('backup.readFailed'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    setBundle(null)
    await readPending(await readFileBytes(f), f.name)
  }

  const restore = async () => {
    if (!bundle) return
    setConfirmReplace(false)
    setBusy(true)
    try {
      const s = await restoreBackup(bundle, mode, setProgress)
      toast.success(t('backup.restored', { sets: s.sets, cards: s.cards }))
      setBundle(null)
      setPending(null)
    } catch {
      toast.error(t('backup.restoreFailed'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const b = bundle?.backup
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Archive className="text-primary" size={20} />
        <CardTitle>{t('backup.title')}</CardTitle>
      </div>
      <p className="mt-1 text-sm text-muted">{t('backup.help')}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Export */}
        <div className="rounded-xl border border-border p-4">
          <div className="font-semibold">{t('backup.exportTitle')}</div>
          <Toggle checked={encrypt} onChange={setEncrypt} label={t('backup.encrypt')} description={t('backup.encryptHelp')} />
          {encrypt && <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t('backup.passphrase')} aria-label={t('backup.passphrase')} autoComplete="new-password" className="mb-3" />}
          <Button leftIcon={<Download size={16} />} onClick={() => void exportBackup()} loading={busy && !bundle && !pending}>
            {t('backup.export')}
          </Button>
        </div>

        {/* Import */}
        <div className="rounded-xl border border-border p-4">
          <div className="font-semibold">{t('backup.importTitle')}</div>
          <p className="mb-3 text-xs text-muted">{t('backup.importHelp')}</p>
          <Button variant="secondary" leftIcon={<Upload size={16} />} onClick={() => fileRef.current?.click()} disabled={busy}>
            {t('backup.chooseFile')}
          </Button>
          <input ref={fileRef} type="file" accept=".zip,.mqz,.json,application/zip,application/json" className="sr-only" aria-label={t('backup.chooseFile')} onChange={(e) => void onFile(e.target.files?.[0])} />
          {pending && <div className="mt-2 truncate text-xs text-muted">{pending.name}</div>}
          {needPass && pending && (
            <div className="mt-3 flex gap-2">
              <Input type="password" value={importPass} onChange={(e) => setImportPass(e.target.value)} placeholder={t('backup.passphrase')} aria-label={t('backup.passphrase')} />
              <Button onClick={() => void readPending(pending.bytes, pending.name, importPass)} disabled={!importPass} loading={busy}>
                {t('backup.unlock')}
              </Button>
            </div>
          )}
          {b && (
            <div className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3 text-sm">
              <div>
                <div className="font-semibold">{t('backup.summary')}</div>
                <div className="text-xs text-muted">
                  {t('backup.summaryLine', { date: new Date(b.exportedAt).toLocaleString(), sets: b.sets.length, cards: b.cards.length, media: bundle?.media.size ?? 0, progress: b.progress?.length ?? 0 })}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="radio" name="restore-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-1 accent-primary" />
                  <span>
                    <span className="font-medium">{t('backup.merge')}</span>
                    <span className="block text-xs text-muted">{t('backup.mergeHelp')}</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="radio" name="restore-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1 accent-primary" />
                  <span>
                    <span className="font-medium">{t('backup.replace')}</span>
                    <span className="block text-xs text-muted">{t('backup.replaceHelp')}</span>
                  </span>
                </label>
              </div>
              <Button variant={mode === 'replace' ? 'danger' : 'primary'} onClick={() => (mode === 'replace' ? setConfirmReplace(true) : void restore())} loading={busy}>
                {t('backup.restore')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {progress && (
        <div className="mt-4" aria-live="polite">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{t(`backup.phase.${progress.phase}`)}</span>
            {progress.total > 1 && (
              <span>
                {progress.done}/{progress.total}
              </span>
            )}
          </div>
          <ProgressBar value={progress.total ? progress.done : 0} max={progress.total || 1} />
        </div>
      )}

      <Modal
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        size="sm"
        title={t('backup.confirmReplaceTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReplace(false)}>
              {t('common:common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void restore()}>
              {t('backup.confirmReplace')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('backup.confirmReplaceBody')}</p>
      </Modal>
    </Card>
  )
}
