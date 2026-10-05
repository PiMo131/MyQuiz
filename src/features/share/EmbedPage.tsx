import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ExternalLink, Shuffle } from 'lucide-react'
import { decodeSet, decodeShared } from '@/domain/share-codec'
import { APP_NAME } from '@/domain/types'
import { shuffle } from '@/domain/text'
import { Markdown, cn } from '@/ui'

interface EmbedCard {
  term: string
  definition: string
  hint?: string
}

function decode(code: string): { title: string; cards: EmbedCard[] } {
  if (code.startsWith('2.')) {
    const s = decodeShared(code)
    return { title: s.set.title, cards: s.cards.map((c) => ({ term: c.cloze ?? c.term, definition: c.definition, hint: c.hint })) }
  }
  const d = decodeSet(code)
  return { title: d.title, cards: d.cards }
}

/** Full-screen minimal flashcard viewer for `<iframe>` embeds. */
export default function EmbedPage() {
  const { t } = useTranslation('share')
  const { code = '' } = useParams()
  const data = useMemo(() => {
    try {
      return decode(decodeURIComponent(code))
    } catch {
      return null
    }
  }, [code])
  const [order, setOrder] = useState<number[]>([])
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const cards = data?.cards ?? []
  const seq = order.length === cards.length ? order : cards.map((_, i) => i)
  const card = cards[seq[idx] ?? 0]

  const total = cards.length
  const go = useCallback(
    (d: number) => {
      if (!total) return
      setFlipped(false)
      setIdx((i) => (i + d + total) % total)
    },
    [total],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go])

  const openLink = `${location.pathname}#/import?d=${encodeURIComponent(code)}`

  if (!data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center text-text">
        <div>
          <p className="font-semibold">{t('embed.invalid')}</p>
          <a href={`${location.pathname}#/`} target="_top" className="mt-2 inline-block text-sm text-primary hover:underline">
            {APP_NAME}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg p-3 text-text sm:p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h1 className="truncate text-sm font-bold">{data.title}</h1>
        <a href={openLink} target="_top" rel="noopener" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-600">
          <ExternalLink size={12} />
          {t('embed.open', { app: APP_NAME })}
        </a>
      </header>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? t('embed.showTerm') : t('embed.showDefinition')}
        className="card relative flex min-h-56 flex-1 items-center justify-center p-6 text-center [perspective:1000px]"
      >
        <div className={cn('transition-transform duration-300 [transform-style:preserve-3d]', flipped && '[transform:rotateX(180deg)]')}>
          <div className={cn('text-xl font-semibold sm:text-2xl', flipped && 'invisible')}>{card && <Markdown src={card.term} />}</div>
          <div className={cn('absolute inset-0 grid place-items-center text-lg sm:text-xl [transform:rotateX(180deg)]', !flipped && 'invisible')}>{card && <Markdown src={card.definition} />}</div>
        </div>
        {!flipped && card?.hint && <span className="absolute bottom-3 left-4 text-xs text-muted">{t('embed.hint', { hint: card.hint })}</span>}
        <span className="absolute bottom-3 right-4 text-[10px] uppercase tracking-wide text-faint">{flipped ? t('embed.definition') : t('embed.term')}</span>
      </button>
      <footer className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={() => go(-1)} className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface hover:bg-surface-2" aria-label={t('common:common.previous')}>
          <ChevronLeft size={18} />
        </button>
        <span className="min-w-14 text-center text-sm tabular-nums text-muted">
          {cards.length ? idx + 1 : 0} / {cards.length}
        </span>
        <button type="button" onClick={() => go(1)} className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface hover:bg-surface-2" aria-label={t('common:common.next')}>
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          onClick={() => {
            setOrder(shuffle(cards.map((_, i) => i)))
            setIdx(0)
            setFlipped(false)
          }}
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-muted hover:bg-surface-2"
          aria-label={t('common:common.shuffle')}
        >
          <Shuffle size={16} />
        </button>
      </footer>
    </div>
  )
}
