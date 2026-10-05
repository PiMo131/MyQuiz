/** Text extraction from uploaded files. PDF goes through a lazily imported pdfjs-dist. */

export type ExtractResult = { ok: true; text: string; pages?: number } | { ok: false; reason: 'unsupported' | 'docx' | 'empty' | 'error'; message?: string }

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|srt|vtt)$/i

export function describeFile(file: File): 'text' | 'pdf' | 'docx' | 'unknown' {
  const name = file.name.toLowerCase()
  if (TEXT_EXT.test(name) || file.type.startsWith('text/')) return 'text'
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (/\.(docx?|pptx?|odt)$/.test(name)) return 'docx'
  return 'unknown'
}

export async function extractText(file: File, onProgress?: (p: number) => void): Promise<ExtractResult> {
  const kind = describeFile(file)
  try {
    if (kind === 'text') {
      const text = (await file.text()).replace(/^﻿/, '')
      return text.trim() ? { ok: true, text } : { ok: false, reason: 'empty' }
    }
    if (kind === 'pdf') return await extractPdf(file, onProgress)
    if (kind === 'docx') return { ok: false, reason: 'docx' }
    return { ok: false, reason: 'unsupported' }
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message }
  }
}

async function extractPdf(file: File, onProgress?: (p: number) => void): Promise<ExtractResult> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  const doc = await task.promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let line = ''
    let lastY: number | null = null
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = item.transform[5] as number
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        parts.push(line.trimEnd())
        line = ''
      }
      line += item.str + (item.hasEOL ? '\n' : ' ')
      lastY = y
    }
    if (line.trim()) parts.push(line.trimEnd())
    parts.push('')
    onProgress?.(i / doc.numPages)
  }
  const pages = doc.numPages
  await task.destroy()
  const text = parts.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return text ? { ok: true, text, pages } : { ok: false, reason: 'empty' }
}
