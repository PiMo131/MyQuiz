import { create } from 'zustand'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from './cn'

export interface ToastItem { id: number; message: string; tone?: 'info' | 'success' | 'error'; action?: { label: string; onClick: () => void }; timeout?: number }
interface ToastState { items: ToastItem[]; push: (t: Omit<ToastItem, 'id'>) => void; remove: (id: number) => void }
let seq = 1
export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (t) => {
    const id = seq++
    set((s) => ({ items: [...s.items, { id, ...t }] }))
    const ms = t.timeout ?? 3500
    if (ms > 0) setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), ms)
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export const toast = {
  info: (message: string, opts?: Partial<ToastItem>) => useToast.getState().push({ message, tone: 'info', ...opts }),
  success: (message: string, opts?: Partial<ToastItem>) => useToast.getState().push({ message, tone: 'success', ...opts }),
  error: (message: string, opts?: Partial<ToastItem>) => useToast.getState().push({ message, tone: 'error', ...opts }),
}

export function Toaster() {
  const { items, remove } = useToast()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 safe-bottom">
      {items.map((t) => (
        <div key={t.id} className={cn('pointer-events-auto animate-pop flex max-w-md items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-pop')}>
          {t.tone === 'success' ? <CheckCircle2 className="text-accent" size={18} /> : t.tone === 'error' ? <TriangleAlert className="text-error" size={18} /> : <Info className="text-primary" size={18} />}
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button className="font-semibold text-primary" onClick={() => { t.action?.onClick(); remove(t.id) }}>
              {t.action.label}
            </button>
          )}
          <button onClick={() => remove(t.id)} className="text-muted hover:text-text" aria-label="Dismiss"><X size={16} /></button>
        </div>
      ))}
    </div>
  )
}
