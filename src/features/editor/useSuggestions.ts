import { useEffect, useState } from 'react'
import { db } from '@/db/db'
import type { Side } from '@/domain/types'

/**
 * Suggest terms/definitions from the user's other sets.
 * - term side: cards whose term starts with the typed text
 * - definition side: definitions of cards whose term equals the current term, else prefix match on definition
 */
export function useSuggestions(enabled: boolean, side: Side, text: string, counterpart: string, excludeSetId: string | undefined, focused: boolean): string[] {
  const key = `${enabled}|${focused}|${side}|${text}|${counterpart}|${excludeSetId ?? ''}`
  const [state, setState] = useState<{ key: string; items: string[] }>({ key, items: [] })
  useEffect(() => {
    if (!enabled || !focused) return
    const q = text.trim().toLowerCase()
    const cp = counterpart.trim().toLowerCase()
    if (q.length < 2 && !(side === 'definition' && cp.length >= 2)) return
    let cancelled = false
    const handle = setTimeout(async () => {
      const out = new Set<string>()
      const scan = db.cards.filter((c) => c.setId !== excludeSetId)
      await scan.until(() => out.size >= 12).each((c) => {
        if (side === 'term') {
          if (q && c.term.toLowerCase().startsWith(q) && c.term.toLowerCase() !== q) out.add(c.term)
        } else {
          if (cp && c.term.toLowerCase() === cp && c.definition.toLowerCase() !== q) out.add(c.definition)
          else if (q && c.definition.toLowerCase().startsWith(q) && c.definition.toLowerCase() !== q) out.add(c.definition)
        }
      })
      if (!cancelled) setState({ key, items: [...out].slice(0, 3) })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [enabled, side, text, counterpart, excludeSetId, focused, key])
  return state.key === key ? state.items : []
}
