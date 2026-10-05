import { useEffect, useRef } from 'react'

export type KeyHandler = (e: KeyboardEvent) => void

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

/**
 * Global keyboard shortcuts. Keys are matched on `e.key` (case-insensitive for letters) or on
 * special names ('ArrowLeft', ' ', 'Enter', '1'…). Ignored while typing in inputs unless `allowInInputs`.
 */
export function useKeys(map: Record<string, KeyHandler>, opts: { enabled?: boolean; allowInInputs?: boolean } = {}) {
  const ref = useRef(map)
  useEffect(() => {
    ref.current = map
  })
  const enabled = opts.enabled ?? true
  const allow = opts.allowInInputs ?? false
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (!allow && isTyping(e)) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const h = ref.current[key] ?? ref.current[e.key]
      if (h) {
        e.preventDefault()
        h(e)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, allow])
}

/** "Press any key to continue" helper. */
export function useAnyKey(handler: (() => void) | null, opts: { enabled?: boolean } = {}) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  const enabled = (opts.enabled ?? true) && !!handler
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Shift' || e.key === 'Tab' || e.key === 'Escape') return
      e.preventDefault()
      ref.current?.()
    }
    const id = setTimeout(() => document.addEventListener('keydown', onKey), 150)
    return () => {
      clearTimeout(id)
      document.removeEventListener('keydown', onKey)
    }
  }, [enabled])
}
