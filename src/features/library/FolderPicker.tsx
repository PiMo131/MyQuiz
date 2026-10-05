import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Folder as FolderIcon, FolderPlus } from 'lucide-react'
import { Select, cn } from '@/ui'
import { NewFolderDialog } from './NewFolderDialog'
import { useFolders } from './useLibraryData'

export interface FolderPickerProps {
  value: string | null | undefined
  onChange: (folderId: string | null) => void
  className?: string
  id?: string
}

/** Select a folder (or none) with an inline "new folder" option. Used by the editor and import flows. */
export function FolderPicker({ value, onChange, className, id }: FolderPickerProps) {
  const { t } = useTranslation('library')
  const folders = useFolders()
  const [creating, setCreating] = useState(false)
  const selected = folders?.find((f) => f.id === value)
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2" aria-hidden>
        <FolderIcon size={16} style={{ color: selected?.color }} className={selected ? '' : 'text-muted'} />
      </span>
      <Select
        id={id}
        aria-label={t('folders.pick')}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v === '__new__') setCreating(true)
          else onChange(v || null)
        }}
      >
        <option value="">{t('folders.none')}</option>
        {folders?.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
        <option value="__new__">＋ {t('folders.new')}</option>
      </Select>
      <button type="button" onClick={() => setCreating(true)} aria-label={t('folders.new')} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border hover:bg-surface-2">
        <FolderPlus size={16} />
      </button>
      <NewFolderDialog open={creating} onClose={() => setCreating(false)} onCreated={(f) => onChange(f.id)} />
    </div>
  )
}
