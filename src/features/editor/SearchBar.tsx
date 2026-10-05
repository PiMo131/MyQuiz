import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/ui'
import type { SearchOptions } from './text-format'

interface Props {
  open: boolean
  onClose: () => void
  query: string
  onQuery: (q: string) => void
  options: SearchOptions
  onOptions: (o: SearchOptions) => void
  matchCount: number
  current: number
  onPrev: () => void
  onNext: () => void
}

/** Floating "search in cards" bar (bottom-left) with Whole words / Match case options. */
export function SearchBar({ open, onClose, query, onQuery, options, onOptions, matchCount, current, onPrev, onNext }: Props) {
  const { t } = useTranslation('editor')
  const [opts, setOpts] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setOpts(false)
  }, [open])
  if (!open) return null
  return (
    <div className="fixed bottom-4 left-4 z-40 w-[min(26rem,calc(100vw-2rem))] safe-bottom" role="search">
      {opts && (
        <div className="animate-pop mb-2 ml-auto w-48 rounded-xl border border-border bg-surface p-2 shadow-pop">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
            <input type="checkbox" checked={options.wholeWords} onChange={(e) => onOptions({ ...options, wholeWords: e.target.checked })} className="accent-primary" />
            {t('search.wholeWords')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
            <input type="checkbox" checked={options.matchCase} onChange={(e) => onOptions({ ...options, matchCase: e.target.checked })} className="accent-primary" />
            {t('search.matchCase')}
          </label>
        </div>
      )}
      <div className="animate-pop flex items-center gap-1 rounded-full border-2 border-primary bg-surface py-1 pl-3 pr-1 shadow-pop">
        <Search size={16} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.shiftKey ? onPrev : onNext)()
            if (e.key === 'Escape') onClose()
          }}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          className="h-8 min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
        />
        {query && (
          <span className="shrink-0 text-xs tabular-nums text-muted" aria-live="polite">
            {matchCount ? `${current + 1}/${matchCount}` : t('search.noMatches')}
          </span>
        )}
        <button type="button" onClick={onPrev} disabled={!matchCount} className="rounded-full p-1.5 text-muted hover:bg-surface-2 disabled:opacity-40" aria-label={t('common:common.previous')}>
          <ChevronUp size={16} />
        </button>
        <button type="button" onClick={onNext} disabled={!matchCount} className="rounded-full p-1.5 text-muted hover:bg-surface-2 disabled:opacity-40" aria-label={t('common:common.next')}>
          <ChevronDown size={16} />
        </button>
        <button type="button" onClick={() => setOpts((o) => !o)} className={cn('rounded-full p-1.5 text-muted hover:bg-surface-2', opts && 'bg-primary-soft text-primary')} aria-label={t('search.options')} aria-expanded={opts}>
          <SlidersHorizontal size={16} />
        </button>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2" aria-label={t('common:common.close')}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
