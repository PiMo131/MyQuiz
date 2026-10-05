import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, Folder as FolderIcon, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import { db } from '@/db/db'
import { deleteFolder, deleteSet, duplicateSet, updateSet } from '@/db/repo'
import { Button, Dropdown, EmptyState, Input, Modal, cn, toast } from '@/ui'
import { SetCard } from './SetCard'
import { NewFolderDialog } from './NewFolderDialog'
import { SaveToFolderModal } from './SaveToFolderModal'
import { ConfirmDialog } from './ConfirmDialog'
import { matchesQuery, useSetMeta, useSets } from './useLibraryData'

export default function FolderPage() {
  const { t } = useTranslation('library')
  const { folderId = '' } = useParams()
  const navigate = useNavigate()
  const folder = useLiveQuery(() => db.folders.get(folderId), [folderId])
  const sets = useSets()
  const meta = useSetMeta()
  const inFolder = useMemo(() => (sets ?? []).filter((s) => s.folderId === folderId), [sets, folderId])
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [moveId, setMoveId] = useState<string | null>(null)
  const [deleteSetId, setDeleteSetId] = useState<string | null>(null)

  if (folder === undefined) return null
  if (folder === null) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <EmptyState icon={<FolderIcon />} title={t('folders.notFound')} action={<Link to="/library?tab=folders"><Button variant="secondary">{t('library.title')}</Button></Link>} />
      </div>
    )
  }
  const color = folder.color ?? '#6366f1'
  const totalCards = inFolder.reduce((a, s) => a + (meta?.get(s.id)?.cards ?? 0), 0)

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/library?tab=folders" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft size={15} />{t('library.title')}</Link>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl" style={{ background: `${color}22`, color }}>
          <FolderIcon size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-bold tracking-tight">{folder.name}</h1>
          <p className="mt-0.5 text-sm text-muted">{t('folders.setCount', { count: inFolder.length })} · {t('common:common.terms', { count: totalCards })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button leftIcon={<Plus size={16} />} onClick={() => setAdding(true)}>{t('folders.addSets')}</Button>
          <Dropdown
            trigger={<button className="rounded-full border border-border p-2 hover:bg-surface-2" aria-label={t('common:common.options')}><MoreHorizontal size={18} /></button>}
            items={[
              { label: t('folders.edit'), icon: <Pencil size={16} />, onSelect: () => setEditing(true) },
              { divider: true, label: '' },
              { label: t('folders.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: () => setConfirmDelete(true) },
            ]}
          />
        </div>
      </div>

      {inFolder.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon={<FolderIcon />} title={t('folders.noSets')} description={t('folders.noSetsHint')} action={<Button onClick={() => setAdding(true)} leftIcon={<Plus size={16} />}>{t('folders.addSets')}</Button>} />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {inFolder.map((s) => (
            <div key={s.id} className="group/row relative">
              <SetCard set={s} meta={meta?.get(s.id)} onMove={(id) => setMoveId(id)} onDuplicate={(id) => void duplicateSet(id).then(() => toast.success(t('library.duplicated')))} onDelete={(id) => setDeleteSetId(id)} />
              <button
                onClick={() => void updateSet(s.id, { folderId: null }).then(() => toast.info(t('folders.removedFrom')))}
                aria-label={t('folders.removeFromFolder')}
                title={t('folders.removeFromFolder')}
                className="absolute -right-2 -top-2 hidden rounded-full border border-border bg-surface p-1 text-muted shadow-sm hover:text-error group-hover/row:block"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <NewFolderDialog open={editing} onClose={() => setEditing(false)} folder={folder} />
      <AddSetsModal open={adding} onClose={() => setAdding(false)} folderId={folderId} />
      {moveId && <SaveToFolderModal open onClose={() => setMoveId(null)} setId={moveId} />}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('folders.deleteTitle', { name: folder.name })}
        body={t('folders.deleteBody')}
        onConfirm={() => void deleteFolder(folderId).then(() => { toast.success(t('folders.deleted')); navigate('/library?tab=folders') })}
      />
      <ConfirmDialog
        open={!!deleteSetId}
        onClose={() => setDeleteSetId(null)}
        title={t('library.deleteTitle', { count: 1 })}
        body={t('library.deleteBody')}
        onConfirm={() => deleteSetId && void deleteSet(deleteSetId).then(() => { setDeleteSetId(null); toast.success(t('library.deleted', { count: 1 })) })}
      />
    </div>
  )
}

function AddSetsModal({ open, onClose, folderId }: { open: boolean; onClose: () => void; folderId: string }) {
  const { t } = useTranslation('library')
  const sets = useSets()
  const meta = useSetMeta()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const candidates = (sets ?? []).filter((s) => s.folderId !== folderId && !s.draft && matchesQuery(s, q))
  const save = async () => {
    setBusy(true)
    try {
      await Promise.all([...picked].map((id) => updateSet(id, { folderId })))
      toast.success(t('folders.addedSets', { count: picked.size }))
      setPicked(new Set())
      onClose()
    } finally { setBusy(false) }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('folders.addSets')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common:common.cancel')}</Button>
          <Button onClick={() => void save()} disabled={!picked.size} loading={busy}>{t('folders.addCount', { count: picked.size })}</Button>
        </>
      }
    >
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('library.searchPlaceholder')} className="mb-3" aria-label={t('library.searchPlaceholder')} />
      {candidates.length === 0 && <p className="py-8 text-center text-sm text-muted">{t('folders.noCandidates')}</p>}
      <ul className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
        {candidates.map((s) => {
          const on = picked.has(s.id)
          return (
            <li key={s.id}>
              <button
                role="checkbox"
                aria-checked={on}
                onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })}
                className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2', on && 'bg-primary-soft/60')}
              >
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border', on ? 'border-primary bg-primary text-white' : 'border-border')}>{on && <Check size={13} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.title}</span>
                  <span className="block text-xs text-muted">{t('common:common.terms', { count: meta?.get(s.id)?.cards ?? 0 })}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
