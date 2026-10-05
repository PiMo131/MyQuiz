import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Search } from 'lucide-react'
import { cn } from '@/ui'
import { filterLanguages, LANGUAGES } from './languages'

interface Props {
  value: string // '' = unknown
  detected?: string
  onChange: (code: string) => void
  /** Languages used in other sets, shown first. */
  recent?: string[]
  align?: 'left' | 'right'
}

/** Searchable language chooser (opens as a popover under a small text button). */
export function LanguagePicker({ value, detected, onChange, recent = [], align = 'right' }: Props) {
  const { t } = useTranslation('editor')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const label = (code: string) => t(`languages.${code}`, { defaultValue: LANGUAGES.find((l) => l.code === code)?.name ?? code })

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    inputRef.current?.focus()
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const list = useMemo(() => filterLanguages(q, label), [q, label])
  const shown = value || detected
  const top = ['chem', 'math', 'nl', 'en', 'de', 'fr', 'es']
  const groups = q
    ? [{ title: '', items: list }]
    : [
        { title: t('language.yours'), items: LANGUAGES.filter((l) => recent.includes(l.code)) },
        { title: t('language.popular'), items: LANGUAGES.filter((l) => top.includes(l.code) && !recent.includes(l.code)) },
        { title: t('language.all'), items: LANGUAGES.filter((l) => !top.includes(l.code) && !recent.includes(l.code)) },
      ].filter((g) => g.items.length)

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn('text-[11px] font-semibold uppercase tracking-wide hover:underline', shown ? 'text-primary' : 'text-primary/80')}
      >
        {shown ? label(shown) : t('language.choose')}
        {!value && detected && <span className="ml-1 font-normal normal-case text-faint">· {t('language.detected')}</span>}
      </button>
      {open && (
        <div
          role="listbox"
          className={cn('animate-pop absolute z-40 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-pop', align === 'right' ? 'right-0' : 'left-0')}
        >
          <div className="relative border-b border-border p-2">
            <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('language.search')}
              className="h-9 w-full rounded-lg border border-border bg-bg pl-8 pr-2 text-sm focus:border-primary focus:outline-none"
              aria-label={t('language.search')}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
            {groups.map((g) => (
              <div key={g.title}>
                {g.title && <div className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{g.title}</div>}
                {g.items.map((l) => (
                  <button
                    key={l.code}
                    role="option"
                    aria-selected={l.code === value}
                    type="button"
                    onClick={() => {
                      onChange(l.code)
                      setOpen(false)
                      setQ('')
                    }}
                    className={cn('flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-2', l.code === value && 'text-primary')}
                  >
                    {label(l.code)}
                    {l.code === value && <Check size={14} />}
                  </button>
                ))}
              </div>
            ))}
            {!list.length && <div className="px-3 py-4 text-center text-sm text-muted">{t('language.noResults')}</div>}
          </div>
          {value && (
            <button
              type="button"
              className="w-full border-t border-border px-3 py-2 text-left text-xs text-muted hover:bg-surface-2"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              {t('language.autoDetect')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
