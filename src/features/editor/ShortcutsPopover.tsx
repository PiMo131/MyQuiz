import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard } from 'lucide-react'
import { Kbd, cn } from '@/ui'
import { isMac } from './text-format'

const SHORTCUTS: Array<{ key: string; keys: string[] }> = [
  { key: 'addCard', keys: ['Ctrl', 'Shift', '↓'] },
  { key: 'nextField', keys: ['Tab'] },
  { key: 'moveCard', keys: ['Alt', '↑/↓'] },
  { key: 'imageGallery', keys: ['Ctrl', 'Shift', 'I'] },
  { key: 'uploadImage', keys: ['Ctrl', 'Shift', 'U'] },
  { key: 'toggleSuggestions', keys: ['Ctrl', 'Shift', 'A'] },
  { key: 'voice', keys: ['Ctrl', 'Shift', 'O'] },
  { key: 'bold', keys: ['Ctrl', 'B'] },
  { key: 'italic', keys: ['Ctrl', 'I'] },
  { key: 'underline', keys: ['Ctrl', 'U'] },
  { key: 'search', keys: ['Ctrl', 'Shift', 'F'] },
]

export function ShortcutsPopover({ className }: { className?: string }) {
  const { t } = useTranslation('editor')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const mod = isMac() ? '⌘' : 'Ctrl'
  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('toolbar.shortcuts')}
        title={t('toolbar.shortcuts')}
        className={cn('grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-muted hover:bg-surface-2 hover:text-text', open && 'bg-primary-soft text-primary')}
      >
        <Keyboard size={18} />
      </button>
      {open && (
        <div role="dialog" aria-label={t('toolbar.shortcuts')} className="animate-pop absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-1 shadow-pop">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
              <div>
                <div className="font-medium">{t(`shortcuts.${s.key}`)}</div>
                {t(`shortcuts.${s.key}Hint`, { defaultValue: '' }) && <div className="text-xs text-muted">{t(`shortcuts.${s.key}Hint`)}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-xs text-faint">+</span>}
                    <Kbd>{k === 'Ctrl' ? mod : k}</Kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
