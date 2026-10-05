import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, GripHorizontal, Star, Trash2 } from 'lucide-react'
import type { LangPair, Side } from '@/domain/types'
import { cn } from '@/ui'
import type { EditorCard } from './editor-state'
import { ExtrasPanel } from './ExtrasPanel'
import { ImagePanel } from './ImagePanel'
import { ImageSlot } from './ImageSlot'
import { OcclusionEditor } from './OcclusionEditor'
import { ClozeField } from './ClozeField'
import { SideField } from './SideField'
import { imageFileFrom, storeImage } from './image-utils'

export interface CardRowProps {
  card: EditorCard
  index: number
  setId?: string
  lang: LangPair
  detected: LangPair
  onLang: (side: Side, code: string) => void
  recentLangs: string[]
  suggestionsEnabled: boolean
  focusedSide: Side | null
  onFocus: (side: Side) => void
  onBlur: () => void
  onChange: (patch: Partial<EditorCard>) => void
  onDelete: () => void
  canDelete: boolean
  registerEl: (side: Side, el: HTMLTextAreaElement | null) => void
  /** search highlighting */
  isMatch: boolean
  isActiveMatch: boolean
  dimmed: boolean
}

export function CardRow(p: CardRowProps) {
  const { t } = useTranslation('editor')
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: p.card.id })
  const [imagePanel, setImagePanel] = useState<Side | null>(null)
  const [occlusionOpen, setOcclusionOpen] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const pendingUpload = useRef(false)

  useEffect(() => {
    if (imagePanel && pendingUpload.current) {
      pendingUpload.current = false
      uploadRef.current?.click()
    }
  }, [imagePanel])

  const imageShortcut = (side: Side) => (kind: 'gallery' | 'upload') => {
    if (kind === 'upload') pendingUpload.current = true
    if (imagePanel === side && kind === 'upload') uploadRef.current?.click()
    else setImagePanel(side)
  }

  const setImage = (side: Side, id: string | undefined) => {
    const image = { ...p.card.image, [side]: id }
    if (!id) delete image[side]
    const patch: Partial<EditorCard> = { image }
    if (!id && p.card.occlusion?.imageId === p.card.image[side]) patch.occlusion = null
    p.onChange(patch)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const f = imageFileFrom(e.clipboardData)
    if (!f || !p.focusedSide) return
    e.preventDefault()
    const side = p.focusedSide
    void storeImage(f).then((m) => setImage(side, m.id))
  }

  const style = { transform: CSS.Transform.toString(transform), transition }
  const occlusionImage = p.card.image.term ?? p.card.image.definition
  const sideProps = (side: Side) => ({
    side,
    value: p.card[side],
    onChange: (v: string) => p.onChange({ [side]: v }),
    lang: p.lang[side],
    detected: p.detected[side],
    onLang: (code: string) => p.onLang(side, code),
    recentLangs: p.recentLangs,
    focused: p.focusedSide === side,
    onFocus: () => p.onFocus(side),
    onBlur: p.onBlur,
    suggestionsEnabled: p.suggestionsEnabled,
    counterpart: p.card[side === 'term' ? 'definition' : 'term'],
    setId: p.setId,
    registerEl: (el: HTMLTextAreaElement | null) => p.registerEl(side, el),
    onImageShortcut: imageShortcut(side),
    label: t(side === 'term' ? 'card.term' : 'card.definition'),
    placeholder: t(side === 'term' ? 'card.termPlaceholder' : 'card.definitionPlaceholder'),
  })

  return (
    <article
      ref={setNodeRef}
      style={style}
      data-card-id={p.card.id}
      onPaste={onPaste}
      className={cn(
        'card relative p-4 transition-shadow sm:p-5',
        isDragging && 'z-10 opacity-80 shadow-pop',
        p.isMatch && 'ring-2 ring-highlight/70',
        p.isActiveMatch && 'ring-primary',
        p.dimmed && 'opacity-40',
      )}
      aria-label={t('card.aria', { n: p.index + 1 })}
    >
      <header className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-muted">{p.index + 1}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => p.onChange({ starred: !p.card.starred })}
            aria-pressed={p.card.starred}
            aria-label={t('card.star')}
            className={cn('rounded-full p-1.5 hover:bg-surface-2', p.card.starred ? 'text-highlight' : 'text-faint hover:text-text')}
          >
            <Star size={16} fill={p.card.starred ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t('card.drag')}
            className="cursor-grab touch-none rounded-full p-1.5 text-faint hover:bg-surface-2 hover:text-text active:cursor-grabbing"
          >
            <GripHorizontal size={18} />
          </button>
          <button
            type="button"
            onClick={p.onDelete}
            disabled={!p.canDelete}
            aria-label={t('card.delete')}
            className="rounded-full p-1.5 text-faint hover:bg-error-soft hover:text-error disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex flex-1 items-start gap-3">
          <ImageSlot mediaId={p.card.image.term} active={imagePanel === 'term'} onToggle={() => setImagePanel(imagePanel === 'term' ? null : 'term')} onRemove={() => setImage('term', undefined)} label={t('image.addTerm')} />
          {p.card.cloze !== null ? (
            <div className="min-w-0 flex-1">
              <ClozeField value={p.card.cloze} onChange={(cloze) => p.onChange({ cloze })} onFocus={() => p.onFocus('term')} />
            </div>
          ) : (
            <SideField {...sideProps('term')} />
          )}
        </div>
        <div className="flex flex-1 items-start gap-3">
          <SideField {...sideProps('definition')} label={p.card.cloze !== null ? t('cloze.back') : t('card.definition')} />
          <ImageSlot
            mediaId={p.card.image.definition}
            active={imagePanel === 'definition'}
            onToggle={() => setImagePanel(imagePanel === 'definition' ? null : 'definition')}
            onRemove={() => setImage('definition', undefined)}
            label={t('image.addDefinition')}
          />
        </div>
      </div>

      {imagePanel && (
        <ImagePanel
          title={t(imagePanel === 'term' ? 'image.addTerm' : 'image.addDefinition')}
          onPicked={(id) => setImage(imagePanel, id)}
          onClose={() => setImagePanel(null)}
          fileInputRef={uploadRef}
        />
      )}

      <button
        type="button"
        onClick={() => p.onChange({ expanded: !p.card.expanded })}
        aria-expanded={p.card.expanded}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        <ChevronDown size={14} className={cn('transition-transform', p.card.expanded && 'rotate-180')} />
        {p.card.expanded ? t('card.lessOptions') : t('card.moreOptions')}
      </button>
      {p.card.expanded && <ExtrasPanel card={p.card} onChange={p.onChange} onOcclusion={() => setOcclusionOpen(true)} />}

      {occlusionImage && (
        <OcclusionEditor
          open={occlusionOpen}
          onClose={() => setOcclusionOpen(false)}
          imageId={occlusionImage}
          rects={p.card.occlusion?.imageId === occlusionImage ? p.card.occlusion.rects : []}
          onSave={(rects) => p.onChange({ occlusion: rects.length ? { imageId: occlusionImage, rects } : null })}
        />
      )}
    </article>
  )
}
