import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Brackets } from 'lucide-react'
import { Badge, Markdown, Textarea } from '@/ui'
import { clozeIndices, renderCloze } from '@/domain/cloze'
import { wrapCloze } from './text-format'

interface Props {
  value: string
  onChange: (v: string) => void
  onFocus?: () => void
}

/** Cloze text editor with a "make blank" helper and a live preview per deletion. */
export function ClozeField({ value, onChange, onFocus }: Props) {
  const { t } = useTranslation('editor')
  const ref = useRef<HTMLTextAreaElement>(null)
  const indices = clozeIndices(value)
  const makeBlank = () => {
    const el = ref.current
    if (!el) return
    const r = wrapCloze(el.value, el.selectionStart, el.selectionEnd)
    onChange(r.value)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(r.selectionStart, r.selectionEnd)
    })
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('cloze.label')}</span>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={makeBlank} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-surface-2" title="{{c1::…}}">
          <Brackets size={14} />
          {t('cloze.makeBlank')}
        </button>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={t('cloze.placeholder')}
        className="min-h-20 font-mono text-sm"
        aria-label={t('cloze.label')}
      />
      {indices.length > 0 && (
        <div className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('cloze.preview')}</div>
          {indices.map((n) => {
            const r = renderCloze(value, n)
            return (
              <div key={n} className="flex flex-wrap items-baseline gap-2">
                <Badge tone="primary">c{n}</Badge>
                <Markdown src={r.question} />
                <span className="text-muted">→</span>
                <span className="font-semibold">{r.answers.join(', ')}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
