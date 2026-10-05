import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Folder as FolderIcon, Plus } from 'lucide-react'
import { db } from '@/db/db'
import { updateSet } from '@/db/repo'
import { Button, Modal, cn, toast } from '@/ui'
import { NewFolderDialog } from './NewFolderDialog'
import { useFolders } from './useLibraryData'

export interface SaveToFolderModalProps {
  open: boolean
  onClose: () => void
  /** One set, or several (multi-select in the library). */
  setId: string | string[]
}

/** Quizlet-style "Save to folder": pick a folder (one per set), "+ New folder", Save. */
export function SaveToFolderModal({ open, onClose, setId }: SaveToFolderModalProps) {
  const { t } = useTranslation('library')
  const ids = Array.isArray(setId) ? setId : [setId]
  const folders = useFolders()
  const current = useLiveQuery(async () => (ids.length === 1 ? (await db.sets.get(ids[0]))?.folderId ?? null : null), [ids.join(',')])
  const [choice, setChoice] = useState<string | null>(current ?? null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  // Re-sync the selection when the dialog opens or the set's folder changes underneath us.
  const syncKey = `${open}:${current ?? ''}`
  const [prevSync, setPrevSync] = useState(syncKey)
  if (syncKey !== prevSync) {
    setPrevSync(syncKey)
    setChoice(current ?? null)
  }

  const save = async () => {
    setBusy(true)
    try {
      await Promise.all(ids.map((id) => updateSet(id, { folderId: choice })))
      const folder = folders?.find((f) => f.id === choice)
      toast.success(folder ? t('folders.savedTo', { name: folder.name }) : t('folders.removedFrom'))
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
      title={t('folders.saveTo')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common:common.cancel')}</Button>
          <Button onClick={() => void save()} loading={busy} disabled={choice === (current ?? null) && ids.length === 1}>{t('common:common.save')}</Button>
        </>
      }
    >
      <div className="pt-1">
        <button onClick={() => setCreating(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-surface-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-primary"><Plus size={16} /></span>
          {t('folders.new')}
        </button>
        <div className="my-2 border-t border-border" />
        {folders && folders.length === 0 && <p className="py-6 text-center text-sm text-muted">{t('folders.empty')}</p>}
        <ul className="max-h-72 space-y-0.5 overflow-y-auto scrollbar-thin" role="listbox" aria-label={t('folders.pick')}>
          {(current || choice) && (
            <li>
              <button role="option" aria-selected={choice === null} onClick={() => setChoice(null)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2', choice === null && 'bg-primary-soft/60')}>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-muted"><FolderIcon size={16} /></span>
                <span className="flex-1 text-muted">{t('folders.none')}</span>
                {choice === null && <Check size={16} className="text-primary" />}
              </button>
            </li>
          )}
          {folders?.map((f) => {
            const active = choice === f.id
            return (
              <li key={f.id}>
                <button role="option" aria-selected={active} onClick={() => setChoice(active ? null : f.id)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2', active && 'bg-primary-soft/60')}>
                  <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${f.color ?? '#6366f1'}22`, color: f.color ?? '#6366f1' }}><FolderIcon size={16} /></span>
                  <span className="flex-1 truncate font-medium">{f.name}</span>
                  <span className={cn('grid h-5 w-5 place-items-center rounded-md border', active ? 'border-primary bg-primary text-white' : 'border-border')}>{active && <Check size={13} />}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <NewFolderDialog open={creating} onClose={() => setCreating(false)} onCreated={(f) => setChoice(f.id)} />
    </Modal>
  )
}
