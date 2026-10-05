import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import i18n from 'i18next'
import { cn } from './cn'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
}

const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-[calc(100vw-2rem)] h-[calc(100dvh-2rem)]' }

export function Modal({ open, onClose, title, children, footer, size = 'md', className }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-dark/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn('card animate-pop relative flex w-full flex-col overflow-hidden p-0', sizes[size], className)}>
        {(
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-2">
            <div className="text-xl font-bold">{title}</div>
            <button
              onClick={onClose}
              aria-label={i18n.t("common.close", { defaultValue: "Close" })}
              className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-text"
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 pb-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
