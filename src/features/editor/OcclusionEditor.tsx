import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Button, Input, Modal, cn } from '@/ui'
import { mediaUrl } from '@/db/repo'
import { newId } from '@/domain/id'
import type { OcclusionRect } from '@/domain/types'

interface Props {
  open: boolean
  onClose: () => void
  imageId: string
  rects: OcclusionRect[]
  onSave: (rects: OcclusionRect[]) => void
}

interface Drag {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Draw rectangles over an image to create image-occlusion cards. Coordinates are stored relative (0..1). */
export function OcclusionEditor({ open, onClose, imageId, rects: initial, onSave }: Props) {
  const { t } = useTranslation('editor')
  const [url, setUrl] = useState<string>()
  const [rects, setRects] = useState<OcclusionRect[]>(initial)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setRects(initial)
      void mediaUrl(imageId).then(setUrl)
    }
  }, [open, imageId, initial])

  const rel = (e: React.PointerEvent): { x: number; y: number } => {
    const r = box.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.rect) return
    const p = rel(e)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    setSelected(null)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const p = rel(e)
    setDrag({ ...drag, x1: p.x, y1: p.y })
  }
  const onUp = () => {
    if (!drag) return
    const x = Math.min(drag.x0, drag.x1)
    const y = Math.min(drag.y0, drag.y1)
    const w = Math.abs(drag.x1 - drag.x0)
    const h = Math.abs(drag.y1 - drag.y0)
    if (w > 0.02 && h > 0.02) {
      const r: OcclusionRect = { id: newId(6), x, y, w, h }
      setRects((rs) => [...rs, r])
      setSelected(r.id)
    }
    setDrag(null)
  }
  const dragStyle = drag
    ? {
        left: `${Math.min(drag.x0, drag.x1) * 100}%`,
        top: `${Math.min(drag.y0, drag.y1) * 100}%`,
        width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
        height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
      }
    : undefined

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('occlusion.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common:common.cancel')}
          </Button>
          <Button
            onClick={() => {
              onSave(rects)
              onClose()
            }}
          >
            {t('occlusion.save', { count: rects.length })}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">{t('occlusion.help')}</p>
      <div
        ref={box}
        className="relative select-none overflow-hidden rounded-xl border border-border bg-surface-2 touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
        style={{ cursor: 'crosshair' }}
      >
        {url ? <img src={url} alt="" className="block max-h-[60vh] w-full object-contain" draggable={false} /> : <div className="h-48" />}
        {rects.map((r, i) => (
          <button
            key={r.id}
            type="button"
            data-rect="1"
            onClick={() => setSelected(r.id)}
            aria-label={t('occlusion.rect', { n: i + 1 })}
            className={cn('absolute grid place-items-center rounded-sm border-2 text-xs font-bold text-white', selected === r.id ? 'border-primary bg-primary/70' : 'border-highlight bg-highlight/70')}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
          >
            {i + 1}
          </button>
        ))}
        {dragStyle && <div className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/20" style={dragStyle} />}
      </div>
      {rects.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rects.map((r, i) => (
            <li key={r.id} className={cn('flex items-center gap-2 rounded-lg px-2 py-1', selected === r.id && 'bg-primary-soft')}>
              <span className="w-6 text-center text-xs font-bold text-muted">{i + 1}</span>
              <Input
                value={r.label ?? ''}
                placeholder={t('occlusion.labelPlaceholder')}
                onChange={(e) => setRects((rs) => rs.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)))}
                className="h-8 py-1"
                aria-label={t('occlusion.label', { n: i + 1 })}
              />
              <button type="button" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-error" onClick={() => setRects((rs) => rs.filter((x) => x.id !== r.id))} aria-label={t('common:common.delete')}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
