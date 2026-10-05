/** Date helpers for study screens (Intl, no deps). */
export function formatDate(ts: number | undefined, lang: string): string {
  if (!ts) return '—'
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleDateString()
  }
}

export function relativeTime(ts: number | undefined, lang: string, now = Date.now()): string {
  if (!ts) return '—'
  const diff = ts - now
  const abs = Math.abs(diff)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 86400000],
    ['month', 30 * 86400000],
    ['week', 7 * 86400000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ]
  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
    for (const [unit, ms] of units) {
      if (abs >= ms || unit === 'minute') return rtf.format(Math.round(diff / ms), unit)
    }
  } catch {
    /* fall through */
  }
  return new Date(ts).toLocaleString()
}

/** "S _ _ _ _" first-letter hint for an answer (keeps spaces and punctuation). */
export function letterHint(answer: string): string {
  const plain = answer.trim()
  if (!plain) return ''
  return plain
    .split(/(\s+)/)
    .map((word) => {
      if (/^\s+$/.test(word)) return ' '
      return word
        .split('')
        .map((ch, i) => (i === 0 || !/[\p{L}\p{N}]/u.test(ch) ? ch : '_'))
        .join(' ')
    })
    .join('  ')
}
