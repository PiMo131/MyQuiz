import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, FileUp, Upload } from 'lucide-react'
import { Badge, Button, Input, Modal, Tabs, cn, toast } from '@/ui'
import type { LangPair } from '@/domain/types'
import { DEFAULT_PASTE_OPTIONS, detectSeparators, parsePaste, type ParseResult, type ParsedCard, type PasteOptions } from '@/domain/import-export/parsers'
import { parseImportFile } from '@/domain/import-export/parse-file'

export interface ImportedCard {
  term: string
  definition: string
  hint?: string
  cloze?: string | null
  tags?: string[]
  image?: { term?: string; definition?: string }
}

export interface ImportMeta {
  title?: string
  description?: string
  lang?: LangPair
  tags?: string[]
  source: ParseResult['source']
}

export interface ImportModalProps {
  open: boolean
  onClose: () => void
  onImport: (cards: ImportedCard[], meta?: ImportMeta) => void
}

type Tab = 'paste' | 'file'

const ACCEPT = '.txt,.csv,.tsv,.md,.json,.apkg,.mqz,text/plain,text/csv,application/json'

export function ImportModal(props: ImportModalProps) {
  if (!props.open) return null
  return <ImportModalBody {...props} />
}

function ImportModalBody({ onClose, onImport }: ImportModalProps) {
  const { t } = useTranslation('editor')
  const [tab, setTab] = useState<Tab>('paste')
  const [text, setText] = useState('')
  const [opts, setOpts] = useState<PasteOptions>(DEFAULT_PASTE_OPTIONS)
  const [autoDetect, setAutoDetect] = useState(true)
  const [edited, setEdited] = useState<ParsedCard[] | null>(null)
  const [fileResult, setFileResult] = useState<ParseResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [needPass, setNeedPass] = useState(false)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const onText = (v: string) => {
    setText(v)
    setEdited(null)
    if (autoDetect && v.trim()) setOpts((o) => ({ ...o, ...detectSeparators(v) }))
  }
  const changeOpts = (patch: Partial<PasteOptions>) => {
    setAutoDetect(false)
    setEdited(null)
    setOpts((o) => ({ ...o, ...patch }))
  }

  const parsed = useMemo(() => (tab === 'paste' ? parsePaste(text, opts) : (fileResult?.cards ?? [])), [tab, text, opts, fileResult])
  const preview = edited ?? parsed

  const updateRow = (i: number, patch: Partial<ParsedCard>) => {
    const base = edited ?? parsed
    setEdited(base.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }
  const swap = () => {
    if (tab === 'paste') changeOpts({ swap: !opts.swap })
    else setEdited((edited ?? parsed).map((c) => ({ ...c, term: c.definition, definition: c.term })))
  }

  const handleFile = useCallback(
    async (file: File, pass?: string) => {
      setBusy(true)
      setEdited(null)
      try {
        const out = await parseImportFile(file, pass)
        if (out.kind === 'needPassphrase') {
          setNeedPass(true)
          setFileName(file.name)
          return
        }
        if (out.kind === 'backup') {
          toast.info(t('import.errBackup'))
          return
        }
        setFileResult(out.result)
        setNeedPass(false)
        setFileName(file.name)
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        toast.error(msg === 'apkgZstd' ? t('import.errApkgZstd') : msg === 'wrongPassphrase' ? t('import.errPassphrase') : t('import.errFile'))
      } finally {
        setBusy(false)
      }
    },
    [t],
  )

  const pendingFile = useRef<File | null>(null)
  const pickFile = (f: File | undefined) => {
    if (!f) return
    pendingFile.current = f
    setTab('file')
    void handleFile(f)
  }

  const count = preview.filter((c) => c.term || c.definition).length
  const doImport = () => {
    const cards: ImportedCard[] = preview
      .filter((c) => c.term || c.definition)
      .map((c) => ({ term: c.term, definition: c.definition, hint: c.hint, cloze: c.cloze ?? undefined, tags: c.tags, image: c.images && (c.images.term || c.images.definition) ? c.images : undefined }))
    const meta: ImportMeta | undefined =
      tab === 'file' && fileResult ? { title: fileResult.title, description: fileResult.description, lang: fileResult.lang, tags: fileResult.tags, source: fileResult.source } : undefined
    onImport(cards, meta)
    onClose()
  }

  const radio = (name: string, checked: boolean, onChange: () => void, label: React.ReactNode) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-primary" />
      {label}
    </label>
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('import.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('import.cancel')}
          </Button>
          <Button onClick={doImport} disabled={!count || busy}>
            {t('import.import')}
            {count > 0 && ` (${count})`}
          </Button>
        </>
      }
    >
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'paste', label: t('import.tabPaste') },
          { value: 'file', label: t('import.tabFile') },
        ]}
      />

      {tab === 'paste' ? (
        <>
          <p className="mb-2 text-sm text-muted">{t('import.pasteHelp')}</p>
          <textarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder={t('import.pastePlaceholder')}
            aria-label={t('import.tabPaste')}
            className="min-h-36 w-full rounded-xl border border-border bg-surface p-3 font-mono text-sm placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">{t('import.betweenSides')}</legend>
              {radio('ts', opts.termSep === 'tab', () => changeOpts({ termSep: 'tab' }), t('import.tab'))}
              {radio('ts', opts.termSep === 'comma', () => changeOpts({ termSep: 'comma' }), t('import.comma'))}
              <div className="flex items-center gap-2">
                <input type="radio" name="ts" checked={opts.termSep === 'custom'} onChange={() => changeOpts({ termSep: 'custom' })} className="accent-primary" aria-label={t('import.custom')} />
                <Input
                  value={opts.customTermSep ?? ''}
                  onChange={(e) => changeOpts({ termSep: 'custom', customTermSep: e.target.value })}
                  onFocus={() => changeOpts({ termSep: 'custom' })}
                  placeholder={t('import.custom')}
                  className="h-9 max-w-40 py-1 font-mono"
                  aria-label={t('import.custom')}
                />
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">{t('import.betweenCards')}</legend>
              {radio('cs', opts.cardSep === 'newline', () => changeOpts({ cardSep: 'newline' }), t('import.newline'))}
              {radio('cs', opts.cardSep === 'semicolon', () => changeOpts({ cardSep: 'semicolon' }), t('import.semicolon'))}
              <div className="flex items-center gap-2">
                <input type="radio" name="cs" checked={opts.cardSep === 'custom'} onChange={() => changeOpts({ cardSep: 'custom' })} className="accent-primary" aria-label={t('import.custom')} />
                <Input
                  value={(opts.customCardSep ?? '').replace(/\n/g, '\\n')}
                  onChange={(e) => changeOpts({ cardSep: 'custom', customCardSep: e.target.value })}
                  onFocus={() => changeOpts({ cardSep: 'custom' })}
                  placeholder={t('import.custom')}
                  className="h-9 max-w-40 py-1 font-mono"
                  aria-label={t('import.custom')}
                />
              </div>
            </fieldset>
          </div>
          <p className="mt-2 text-xs text-muted">{t('import.customHelp')}</p>
        </>
      ) : (
        <div
          className={cn('rounded-xl border-2 border-dashed p-6 text-center transition-colors', over ? 'border-primary bg-primary-soft' : 'border-border')}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            pickFile(e.dataTransfer.files?.[0])
          }}
        >
          <FileUp className="mx-auto mb-2 text-primary" size={28} />
          <p className="text-sm font-semibold">{fileName || t('import.dropTitle')}</p>
          <p className="mt-1 text-xs text-muted">{t('import.dropFormats')}</p>
          <Button className="mt-3" variant="secondary" leftIcon={<Upload size={16} />} loading={busy} onClick={() => fileRef.current?.click()}>
            {t('import.chooseFile')}
          </Button>
          <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" aria-label={t('import.chooseFile')} onChange={(e) => pickFile(e.target.files?.[0])} />
          {needPass && (
            <div className="mx-auto mt-4 flex max-w-sm items-center gap-2">
              <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder={t('import.passphrase')} aria-label={t('import.passphrase')} />
              <Button onClick={() => pendingFile.current && void handleFile(pendingFile.current, passphrase)} disabled={!passphrase}>
                {t('import.unlock')}
              </Button>
            </div>
          )}
          {fileResult && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Badge tone="primary">{t(`import.source.${fileResult.source}`)}</Badge>
              {fileResult.title && <Badge>{fileResult.title}</Badge>}
              {fileResult.warnings.map((w) => (
                <Badge key={w} tone="highlight">
                  {t(`import.warn.${w}`)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <h3 className="text-base font-bold">
          {t('import.preview')} <span className="ml-1 text-sm font-normal text-muted">{t('common:common.cards', { count })}</span>
        </h3>
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeftRight size={15} />} onClick={swap} disabled={!count}>
          {t('import.swap')}
        </Button>
      </div>
      <div className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-xl bg-surface-2 p-2 scrollbar-thin">
        {preview.length === 0 && <p className="py-6 text-center text-sm text-muted">{t('import.empty')}</p>}
        {preview.slice(0, 200).map((c, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg bg-surface p-2">
            <span className="w-6 pt-2 text-center text-xs font-bold text-muted">{i + 1}</span>
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <div>
                <Input value={c.cloze ?? c.term} onChange={(e) => updateRow(i, c.cloze ? { cloze: e.target.value } : { term: e.target.value })} aria-label={t('card.term')} className="h-9 py-1" />
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">{c.cloze ? t('cloze.label') : t('card.term')}</div>
              </div>
              <div>
                <Input value={c.definition} onChange={(e) => updateRow(i, { definition: e.target.value })} aria-label={t('card.definition')} className="h-9 py-1" />
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">{t('card.definition')}</div>
              </div>
            </div>
          </div>
        ))}
        {preview.length > 200 && <p className="py-2 text-center text-xs text-muted">{t('import.more', { count: preview.length - 200 })}</p>}
      </div>
    </Modal>
  )
}
