import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, FileUp, Import, Link2, Settings } from 'lucide-react'
import { db } from '@/db/db'
import { addCards, createSet, putMedia, replaceCards, updateSet, type NewCard } from '@/db/repo'
import type { StudySet } from '@/domain/types'
import { dataUrlToBlob } from '@/domain/import-export/exporters'
import { parseImportFile } from '@/domain/import-export/parse-file'
import { decodeCode, extractCode, type Decoded } from './share-utils'
import { Badge, Button, Card, EmptyState, Input, Label, Markdown, Select, cn, toast } from '@/ui'

export default function ImportPage() {
  const { t } = useTranslation('share')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const paramCode = params.get('d')
  const initial = useMemo<Decoded | 'error' | null>(() => {
    const code = paramCode ? extractCode(paramCode) : undefined
    if (!code) return null
    try {
      return decodeCode(code)
    } catch {
      return 'error'
    }
  }, [paramCode])
  const [input, setInput] = useState('')
  const [decoded, setDecoded] = useState<Decoded | null>(() => (initial && initial !== 'error' ? initial : null))
  const [error, setError] = useState<string | null>(() => (initial === 'error' ? t('import.errDecode') : null))
  const [title, setTitle] = useState(() => (initial && initial !== 'error' ? initial.title : ''))
  const [folderId, setFolderId] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [needPass, setNeedPass] = useState<File | null>(null)
  const [pass, setPass] = useState('')
  const [isBackupFile, setIsBackupFile] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const folders = useLiveQuery(() => db.folders.orderBy('name').toArray(), [])
  const existing = useLiveQuery(async () => (decoded?.externalId ? db.sets.where('externalId').equals(decoded.externalId).first() : undefined), [decoded?.externalId])

  const apply = useCallback((d: Decoded) => {
    setDecoded(d)
    setTitle(d.title)
    setError(null)
    setIsBackupFile(false)
  }, [])

  const tryCode = useCallback(
    (raw: string) => {
      const code = extractCode(raw)
      if (!code) {
        if (raw.trim()) setError(t('import.errNoCode'))
        return
      }
      try {
        apply(decodeCode(code))
      } catch {
        setError(t('import.errDecode'))
      }
    },
    [apply, t],
  )

  const onFile = async (file: File | undefined, passphrase?: string) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const out = await parseImportFile(file, passphrase)
      if (out.kind === 'needPassphrase') {
        setNeedPass(file)
        return
      }
      if (out.kind === 'backup') {
        setIsBackupFile(true)
        setDecoded(null)
        return
      }
      setNeedPass(null)
      const r = out.result
      apply({
        title: r.title ?? file.name.replace(/\.[^.]+$/, ''),
        description: r.description ?? '',
        lang: r.lang ?? { term: '', definition: '' },
        tags: r.tags ?? [],
        cards: r.cards,
        externalId: r.externalId,
        shared: r.shared,
        sourceLabel: r.source,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg === 'wrongPassphrase' ? t('import.errPassphrase') : msg === 'apkgZstd' ? t('import.errApkgZstd') : t('import.errFile'))
    } finally {
      setBusy(false)
    }
  }

  const doImport = async (mode: 'copy' | 'update') => {
    if (!decoded) return
    setBusy(true)
    try {
      // media (format 2 / MyQuizz JSON)
      if (decoded.shared?.media) {
        for (const m of decoded.shared.media) {
          if (!(await db.media.get(m.id))) await putMedia(await dataUrlToBlob(m.dataUrl), { id: m.id, mime: m.mime })
        }
      }
      const byId = new Map(decoded.shared?.cards.map((c) => [c.id, c]) ?? [])
      const toCards = (setId: string): NewCard[] =>
        decoded.cards.map((c) => {
          const full = c.externalId ? byId.get(c.externalId) : undefined
          return {
            ...(full ?? {}),
            id: full?.id,
            setId,
            term: c.term,
            definition: c.definition,
            hint: c.hint,
            cloze: c.cloze ?? full?.cloze ?? null,
            image: full?.image ?? (c.images && (c.images.term || c.images.definition) ? c.images : undefined),
          }
        })
      const meta: Partial<StudySet> & { title: string } = { title: title.trim() || decoded.title || t('import.untitled'), description: decoded.description, lang: decoded.lang, tags: decoded.tags }
      let id: string
      if (mode === 'update' && existing) {
        id = existing.id
        await updateSet(id, { ...meta, folderId: folderId || existing.folderId })
        await replaceCards(id, toCards(id))
      } else {
        const s = await createSet({ ...meta, folderId: folderId || null, externalId: decoded.externalId, author: decoded.shared?.set.author })
        id = s.id
        await addCards(id, toCards(id))
      }
      toast.success(t('import.done', { count: decoded.cards.length }))
      navigate(`/set/${id}`)
    } catch {
      toast.error(t('import.errImport'))
    } finally {
      setBusy(false)
    }
  }

  const preview = useMemo(() => decoded?.cards.slice(0, 6) ?? [], [decoded])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('import.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('import.subtitle')}</p>
      </div>

      {!decoded && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Link2 size={18} className="text-primary" />
              {t('import.codeTitle')}
            </div>
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setError(null)
              }}
              onPaste={(e) => {
                const txt = e.clipboardData.getData('text')
                if (extractCode(txt)) {
                  e.preventDefault()
                  setInput(txt)
                  tryCode(txt)
                }
              }}
              placeholder={t('import.codePlaceholder')}
              aria-label={t('import.codeTitle')}
              rows={4}
              className="w-full rounded-xl border border-border bg-surface p-3 font-mono text-xs placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button className="mt-3" onClick={() => tryCode(input)} disabled={!input.trim()}>
              {t('import.decode')}
            </Button>
          </Card>
          <Card
            className={cn('flex flex-col items-center justify-center border-2 border-dashed text-center transition-colors', over && 'border-primary bg-primary-soft')}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              void onFile(e.dataTransfer.files?.[0])
            }}
          >
            <FileUp size={28} className="mb-2 text-primary" />
            <div className="font-semibold">{t('import.fileTitle')}</div>
            <p className="mt-1 text-xs text-muted">{t('import.fileFormats')}</p>
            <Button className="mt-3" variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}>
              {t('import.chooseFile')}
            </Button>
            <input ref={fileRef} type="file" accept=".json,.mqz,.txt,.csv,.tsv,.md,.apkg" className="sr-only" aria-label={t('import.chooseFile')} onChange={(e) => void onFile(e.target.files?.[0])} />
            {needPass && (
              <div className="mt-3 flex w-full gap-2">
                <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t('import.passphrase')} aria-label={t('import.passphrase')} />
                <Button onClick={() => void onFile(needPass, pass)} disabled={!pass} loading={busy}>
                  {t('import.unlock')}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {error && <p className="rounded-xl bg-error-soft px-4 py-3 text-sm text-error">{error}</p>}

      {isBackupFile && (
        <EmptyState
          icon={<Settings />}
          title={t('import.backupTitle')}
          description={t('import.backupBody')}
          action={
            <Link to="/settings">
              <Button variant="secondary">{t('import.goSettings')}</Button>
            </Link>
          }
        />
      )}

      {decoded && (
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge tone="primary">{t(`import.source.${decoded.sourceLabel}`, { defaultValue: decoded.sourceLabel })}</Badge>
                <Badge>{t('common:common.cards', { count: decoded.cards.length })}</Badge>
                {decoded.shared?.media?.length ? <Badge tone="secondary">{t('import.withMedia', { count: decoded.shared.media.length })}</Badge> : null}
              </div>
              {decoded.description && <p className="mt-2 text-sm text-muted">{decoded.description}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDecoded(null)}>
              {t('import.startOver')}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
            <div>
              <Label htmlFor="imp-title">{t('import.titleField')}</Label>
              <Input id="imp-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="imp-folder">{t('import.folder')}</Label>
              <Select id="imp-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">{t('import.noFolder')}</option>
                {folders?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('import.preview')}</div>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {preview.map((c, i) => (
                <li key={i} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-2">
                  <Markdown src={c.cloze ?? c.term} className="font-medium" />
                  <Markdown src={c.definition} className="text-muted" />
                </li>
              ))}
            </ul>
            {decoded.cards.length > preview.length && <p className="mt-2 text-xs text-muted">{t('import.andMore', { count: decoded.cards.length - preview.length })}</p>}
          </div>

          {existing ? (
            <div className="rounded-xl border border-highlight/40 bg-highlight-soft p-4">
              <p className="text-sm font-semibold">{t('import.existsTitle', { title: existing.title })}</p>
              <p className="mt-1 text-xs text-muted">{t('import.existsBody')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => void doImport('update')} loading={busy} leftIcon={<Import size={16} />}>
                  {t('import.updateExisting')}
                </Button>
                <Button variant="outline" onClick={() => void doImport('copy')} disabled={busy}>
                  {t('import.importCopy')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button size="lg" onClick={() => void doImport('copy')} loading={busy} leftIcon={<Download size={18} />} disabled={!decoded.cards.length}>
                {t('import.import')}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
