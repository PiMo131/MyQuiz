/** Image helpers for the editor: downscale to max 1024px WebP via canvas and store in Dexie. */
import { putMedia } from '@/db/repo'
import type { MediaItem } from '@/domain/types'

export const MAX_IMAGE_PX = 1024

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('imageLoadFailed'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export interface ProcessedImage {
  blob: Blob
  width: number
  height: number
}

/** Downscale (longest side ≤ maxPx) and encode as WebP (falls back to the original blob when canvas is unavailable). */
export async function downscaleImage(file: Blob, maxPx = MAX_IMAGE_PX): Promise<ProcessedImage> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return { blob: file, width: 0, height: 0 }
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return { blob: file, width: img.naturalWidth, height: img.naturalHeight }
    ctx.drawImage(img, 0, 0, w, h)
    const webp = (await canvasToBlob(canvas, 'image/webp', 0.85)) ?? (await canvasToBlob(canvas, 'image/jpeg', 0.85))
    if (!webp || webp.size >= file.size * 1.2) return { blob: file, width: w, height: h }
    return { blob: webp, width: w, height: h }
  } catch {
    return { blob: file, width: 0, height: 0 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Process and persist an image, returning the media item. */
export async function storeImage(file: Blob): Promise<MediaItem> {
  const p = await downscaleImage(file)
  return putMedia(p.blob, { width: p.width || undefined, height: p.height || undefined, mime: p.blob.type || file.type })
}

/** Fetch an image URL (same-origin, CORS-enabled or data URL) and store it. */
export async function storeImageFromUrl(url: string): Promise<MediaItem> {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error('fetchFailed')
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) throw new Error('notAnImage')
  return storeImage(blob)
}

/** First image file from a clipboard or drag event, if any. */
export function imageFileFrom(dt: DataTransfer | null): File | null {
  if (!dt) return null
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  for (const f of Array.from(dt.files ?? [])) if (f.type.startsWith('image/')) return f
  return null
}
