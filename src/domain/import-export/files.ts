/** Small browser file helpers (download, read). No React. */

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadText(text: string, fileName: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mime }), fileName)
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/octet-stream'): void {
  downloadBlob(new Blob([bytes as BlobPart], { type: mime }), fileName)
}

export function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsText(file)
  })
}

/** Blob → bytes, with a FileReader fallback for environments without Blob.arrayBuffer (jsdom). */
export function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((b) => new Uint8Array(b))
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer))
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(blob)
  })
}

export function readFileBytes(file: Blob): Promise<Uint8Array> {
  return blobToBytes(file)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export const MIME_EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/webm': 'weba',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
}

export function extFor(mime: string): string {
  return MIME_EXT[mime] ?? (mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin')
}

export function mimeForExt(ext: string): string {
  const e = ext.toLowerCase()
  for (const [m, x] of Object.entries(MIME_EXT)) if (x === e) return m
  return e === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'
}
