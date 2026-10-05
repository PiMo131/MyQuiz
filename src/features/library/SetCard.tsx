import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Check, Copy, Folder as FolderIcon, FolderInput, MoreHorizontal, Pencil, Share2, Trash2, ExternalLink } from 'lucide-react'
import type { Folder, StudySet } from '@/domain/types'
import { Badge, Dropdown, Ring, cn } from '@/ui'
import type { SetMeta } from './useLibraryData'
import { timeAgo } from './format'

export interface SetCardProps {
  set: StudySet
  meta?: SetMeta
  folder?: Folder
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
  onMove?: (id: string) => void
  onDuplicate?: (id: string) => void
  onDelete?: (id: string) => void
  compact?: boolean
}

export function SetCard({ set, meta, folder, selectable, selected, onToggleSelect, onMove, onDuplicate, onDelete, compact }: SetCardProps) {
  const { t, i18n } = useTranslation('library')
  const navigate = useNavigate()
  const cards = meta?.cards ?? 0
  const ts = set.lastStudiedAt ?? set.updatedAt
  return (
    <div className={cn('card group relative flex items-center gap-4 p-4 transition hover:shadow-pop', selected && 'ring-2 ring-primary')}>
      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={!!selected}
          aria-label={t('library.select', { title: set.title })}
          onClick={() => onToggleSelect?.(set.id)}
          className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border transition', selected ? 'border-primary bg-primary text-white' : 'border-border bg-surface hover:border-primary')}
        >
          {selected && <Check size={13} />}
        </button>
      )}
      <div className="relative shrink-0">
        <Ring value={meta?.mastery ?? 0} size={compact ? 44 : 52} stroke={5} label={`${meta?.mastery ?? 0}%`} />
      </div>
      <Link to={`/set/${set.id}`} className="min-w-0 flex-1 focus:outline-none" aria-label={set.title}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="font-semibold">{t('common:common.terms', { count: cards })}</span>
          {set.draft && <Badge tone="highlight">{t('library.draft')}</Badge>}
          {folder && (
            <Badge tone="neutral" className="max-w-40">
              <FolderIcon size={11} style={{ color: folder.color }} />
              <span className="truncate">{folder.name}</span>
            </Badge>
          )}
          {ts > 0 && <span className="hidden sm:inline">· {set.lastStudiedAt ? t('library.studied', { when: timeAgo(ts, i18n.language) }) : t('library.updated', { when: timeAgo(ts, i18n.language) })}</span>}
        </div>
        <h3 className="mt-0.5 truncate text-base font-semibold group-hover:text-primary">{set.title || t('library.untitled')}</h3>
        {!compact && set.description && <p className="mt-0.5 line-clamp-1 text-sm text-muted">{set.description}</p>}
        {!compact && set.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {set.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">#{tag}</span>
            ))}
          </div>
        )}
      </Link>
      <Dropdown
        trigger={
          <button className="rounded-full p-2 text-muted opacity-70 hover:bg-surface-2 hover:text-text group-hover:opacity-100" aria-label={t('library.moreFor', { title: set.title })}>
            <MoreHorizontal size={18} />
          </button>
        }
        items={[
          { label: t('library.open'), icon: <ExternalLink size={16} />, onSelect: () => navigate(`/set/${set.id}`) },
          { label: t('common:common.edit'), icon: <Pencil size={16} />, onSelect: () => navigate(`/set/${set.id}/edit`) },
          { label: t('library.moveToFolder'), icon: <FolderInput size={16} />, onSelect: () => onMove?.(set.id), disabled: !onMove },
          { label: t('library.duplicate'), icon: <Copy size={16} />, onSelect: () => onDuplicate?.(set.id), disabled: !onDuplicate },
          { label: t('library.exportShare'), icon: <Share2 size={16} />, onSelect: () => navigate(`/set/${set.id}?share=1`) },
          { divider: true, label: '' },
          { label: t('common:common.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: () => onDelete?.(set.id), disabled: !onDelete },
        ]}
      />
    </div>
  )
}
