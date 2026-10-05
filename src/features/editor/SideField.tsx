import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Side } from '@/domain/types'
import { cn } from '@/ui'
import { FormattingToolbar } from './FormattingToolbar'
import { LanguagePicker } from './LanguagePicker'
import { charsFor } from './languages'
import { applyFormat, insertAtCaret, type FormatKind } from './text-format'
import { useDictation } from './useDictation'
import { useSuggestions } from './useSuggestions'

export const MAX_LEN: Record<Side, number> = { term: 930, definition: 1500 }

export interface SideFieldProps {
  side: Side
  value: string
  onChange: (v: string) => void
  lang: string
  detected: string
  onLang: (code: string) => void
  recentLangs: string[]
  focused: boolean
  onFocus: () => void
  onBlur: () => void
  suggestionsEnabled: boolean
  counterpart: string
  setId?: string
  registerEl: (el: HTMLTextAreaElement | null) => void
  onImageShortcut: (kind: 'gallery' | 'upload') => void
  label: string
  placeholder: string
}

/** One side of a card: auto-growing textarea with toolbar, counter, language, special characters and suggestions. */
export function SideField(p: SideFieldProps) {
  const { t } = useTranslation('editor')
  const ref = useRef<HTMLTextAreaElement>(null)
  const effLang = p.lang || p.detected
  const chars = charsFor(effLang)
  const suggestions = useSuggestions(p.suggestionsEnabled, p.side, p.value, p.counterpart, p.setId, p.focused)

  const setValueWithSelection = useCallback(
    (r: { value: string; selectionStart: number; selectionEnd: number }) => {
      p.onChange(r.value)
      requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        el.focus()
        el.setSelectionRange(r.selectionStart, r.selectionEnd)
      })
    },
    [p],
  )
  const format = useCallback(
    (k: FormatKind) => {
      const el = ref.current
      if (!el) return
      setValueWithSelection(applyFormat(el.value, el.selectionStart, el.selectionEnd, k))
    },
    [setValueWithSelection],
  )
  const insert = useCallback(
    (text: string) => {
      const el = ref.current
      if (!el) return
      setValueWithSelection(insertAtCaret(el.value, el.selectionStart, el.selectionEnd, text))
    },
    [setValueWithSelection],
  )
  const dictation = useDictation((text) => insert((ref.current?.value && !/\s$/.test(ref.current.value) ? ' ' : '') + text))

  // auto-grow
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(44, el.scrollHeight)}px`
  }, [p.value])

  useEffect(() => {
    p.registerEl(ref.current)
    return () => p.registerEl(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    const k = e.key.toLowerCase()
    if (e.shiftKey) {
      if (k === 'i') {
        e.preventDefault()
        p.onImageShortcut('gallery')
      } else if (k === 'u') {
        e.preventDefault()
        p.onImageShortcut('upload')
      } else if (k === 'o') {
        e.preventDefault()
        if (dictation.listening) dictation.stop()
        else dictation.start(effLang)
      }
      return
    }
    if (k === 'b' || k === 'i' || k === 'u') {
      e.preventDefault()
      format(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline')
    }
  }

  const over = p.value.length > MAX_LEN[p.side]
  return (
    <div className="relative min-w-0 flex-1">
      {p.focused && (
        <div className="pointer-events-none absolute -top-10 left-1/2 z-30 -translate-x-1/2">
          <FormattingToolbar
            className="pointer-events-auto"
            onFormat={format}
            micSupported={dictation.supported}
            listening={dictation.listening}
            onMic={() => (dictation.listening ? dictation.stop() : dictation.start(effLang))}
          />
        </div>
      )}
      <textarea
        ref={ref}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        onFocus={p.onFocus}
        onBlur={p.onBlur}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={p.placeholder}
        aria-label={p.label}
        lang={effLang && effLang.length <= 5 ? effLang : undefined}
        spellCheck
        className={cn(
          'block w-full resize-none overflow-hidden rounded-xl border bg-surface px-3.5 py-2.5 text-sm leading-6 placeholder:text-faint transition focus:outline-none focus:ring-2 focus:ring-primary/30',
          over ? 'border-error focus:border-error' : 'border-border focus:border-primary',
        )}
      />
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span>
          {p.label}
          {p.focused && (
            <span className={cn('ml-1 font-normal tabular-nums', over ? 'text-error' : 'text-faint')}>
              ({p.value.length}/{MAX_LEN[p.side]})
            </span>
          )}
        </span>
        <LanguagePicker value={p.lang} detected={p.detected} onChange={p.onLang} recent={p.recentLangs} />
      </div>
      {p.focused && chars.length > 0 && (
        <div className="no-scrollbar mt-1.5 flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1.5" role="toolbar" aria-label={t('specialChars')}>
          {chars.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(c)}
              className="grid h-7 min-w-7 shrink-0 place-items-center rounded-md px-1 text-sm hover:bg-surface"
              aria-label={c}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {p.focused && suggestions.length > 0 && (
        <ul className="mt-1.5 space-y-1" aria-label={t('suggestions.label')}>
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  p.onChange(s)
                  ref.current?.focus()
                }}
                className="w-full truncate rounded-lg border border-border bg-surface px-3 py-1.5 text-left text-sm hover:bg-surface-2"
              >
                <span className="font-semibold">{s.slice(0, p.value.length)}</span>
                {s.slice(p.value.length)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
