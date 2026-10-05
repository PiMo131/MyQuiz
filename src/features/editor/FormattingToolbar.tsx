import { useTranslation } from 'react-i18next'
import { Bold, Italic, Mic, MicOff, Underline } from 'lucide-react'
import { cn } from '@/ui'
import type { FormatKind } from './text-format'

interface Props {
  onFormat: (k: FormatKind) => void
  onMic?: () => void
  listening?: boolean
  micSupported?: boolean
  className?: string
}

/** Floating B / I / U / highlight / mic toolbar shown above a focused field. Buttons keep focus in the textarea. */
export function FormattingToolbar({ onFormat, onMic, listening, micSupported, className }: Props) {
  const { t } = useTranslation('editor')
  const btn = 'grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text'
  const prevent = (e: React.MouseEvent) => e.preventDefault()
  return (
    <div role="toolbar" aria-label={t('format.toolbar')} className={cn('inline-flex items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-pop', className)}>
      <button type="button" className={btn} onMouseDown={prevent} onClick={() => onFormat('bold')} aria-label={t('format.bold')} title={`${t('format.bold')} (Ctrl+B)`}>
        <Bold size={15} />
      </button>
      <button type="button" className={btn} onMouseDown={prevent} onClick={() => onFormat('italic')} aria-label={t('format.italic')} title={`${t('format.italic')} (Ctrl+I)`}>
        <Italic size={15} />
      </button>
      <button type="button" className={btn} onMouseDown={prevent} onClick={() => onFormat('underline')} aria-label={t('format.underline')} title={`${t('format.underline')} (Ctrl+U)`}>
        <Underline size={15} />
      </button>
      <span className="mx-1 h-5 w-px bg-border" />
      {(
        [
          ['hlYellow', '#fde68a'],
          ['hlBlue', '#bfdbfe'],
          ['hlPink', '#fbcfe8'],
        ] as const
      ).map(([k, color]) => (
        <button key={k} type="button" className={btn} onMouseDown={prevent} onClick={() => onFormat(k)} aria-label={t(`format.${k}`)} title={t(`format.${k}`)}>
          <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: color }} />
        </button>
      ))}
      {micSupported && onMic && (
        <>
          <span className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            className={cn(btn, listening && 'bg-error-soft text-error')}
            onMouseDown={prevent}
            onClick={onMic}
            aria-pressed={listening}
            aria-label={listening ? t('format.stopDictation') : t('format.dictate')}
            title={t('format.dictate')}
          >
            {listening ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
        </>
      )}
    </div>
  )
}
