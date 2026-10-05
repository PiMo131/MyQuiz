import { useEffect, useState } from 'react'
import { mediaUrl } from '@/db/repo'
import { Markdown, cn } from '@/ui'

export function useMediaUrl(id: string | undefined | null): string | undefined {
  const [resolved, setResolved] = useState<{ id: string; url: string | undefined } | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    void mediaUrl(id).then((u) => alive && setResolved({ id, url: u }))
    return () => {
      alive = false
    }
  }, [id])
  return id && resolved?.id === id ? resolved.url : undefined
}

/** Markdown text + optional image, sized for a card face or a question prompt. */
export function CardFace({ text, image, className, textClassName, imgClassName }: { text: string; image?: string | null; className?: string; textClassName?: string; imgClassName?: string }) {
  const url = useMediaUrl(image)
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 text-center', className)}>
      {url && <img src={url} alt="" className={cn('max-h-48 max-w-full rounded-xl object-contain', imgClassName)} />}
      {text && <Markdown src={text} as="div" className={cn('break-words [overflow-wrap:anywhere]', textClassName)} />}
    </div>
  )
}
