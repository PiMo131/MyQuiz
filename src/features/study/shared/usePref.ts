import { useCallback, useState } from 'react'

/** Per-device UI preference persisted in localStorage (safe in private windows). */
export function usePref<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const full = `myquizz.study.${key}`
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(full)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
        try {
          localStorage.setItem(full, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [full],
  )
  return [value, set]
}
