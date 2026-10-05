import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { createFolder } from '@/db/repo'
import { db } from '@/db/db'
import { now } from '@/domain/id'
import type { Folder } from '@/domain/types'
import { Button, Input, Label, Modal, cn } from '@/ui'
import { FOLDER_COLORS } from './useLibraryData'

export interface NewFolderDialogProps {
  open: boolean
  onClose: () => void
  /** Edit an existing folder instead of creating one. */
  folder?: Folder | null
  onCreated?: (folder: Folder) => void
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { t } = useTranslation('library')
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('folders.colour')}>
      {FOLDER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn('grid h-8 w-8 place-items-center rounded-full text-white ring-offset-2 ring-offset-surface transition', value === c && 'ring-2 ring-primary')}
          style={{ background: c }}
        >
          {value === c && <Check size={14} />}
        </button>
      ))}
    </div>
  )
}

export function NewFolderDialog({ open, onClose, folder, onCreated }: NewFolderDialogProps) {
  const { t } = useTranslation('library')
  const [name, setName] = useState('')
  const [color, setColor] = useState(FOLDER_COLORS[0])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setName(folder?.name ?? '')
      setColor(folder?.color ?? FOLDER_COLORS[0])
    }
  }, [open, folder])
  const submit = async () => {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      if (folder) {
        await db.folders.update(folder.id, { name: n, color, updatedAt: now() })
        onCreated?.({ ...folder, name: n, color })
      } else {
        const f = await createFolder(n, null, color)
        onCreated?.(f)
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={folder ? t('folders.edit') : t('folders.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common:common.cancel')}</Button>
          <Button onClick={() => void submit()} disabled={!name.trim()} loading={busy}>{folder ? t('common:common.save') : t('folders.create')}</Button>
        </>
      }
    >
      <form
        className="space-y-4 pt-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div>
          <Label htmlFor="folder-name">{t('folders.name')}</Label>
          <Input id="folder-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('folders.namePlaceholder')} maxLength={80} />
        </div>
        <div>
          <Label>{t('folders.colour')}</Label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </form>
    </Modal>
  )
}
