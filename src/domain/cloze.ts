/** Anki-style cloze: {{c1::answer::hint}} */
export interface ClozePart {
  type: 'text' | 'cloze'
  text: string
  index?: number
  hint?: string
}

const RE = /\{\{c(\d+)::((?:(?!::|\}\}).)+)(?:::((?:(?!\}\}).)+))?\}\}/g

export function parseCloze(src: string): ClozePart[] {
  const parts: ClozePart[] = []
  let last = 0
  for (const m of src.matchAll(RE)) {
    if (m.index! > last) parts.push({ type: 'text', text: src.slice(last, m.index) })
    parts.push({ type: 'cloze', text: m[2], index: Number(m[1]), hint: m[3] })
    last = m.index! + m[0].length
  }
  if (last < src.length) parts.push({ type: 'text', text: src.slice(last) })
  return parts
}

export function clozeIndices(src: string): number[] {
  return [...new Set(parseCloze(src).filter((p) => p.type === 'cloze').map((p) => p.index!))].sort((a, b) => a - b)
}

/** Render cloze n as question (blank) and the answer(s) for that index. */
export function renderCloze(src: string, n: number): { question: string; answers: string[]; full: string } {
  const parts = parseCloze(src)
  const answers: string[] = []
  const question = parts
    .map((p) => {
      if (p.type === 'text') return p.text
      if (p.index === n) {
        answers.push(p.text)
        return p.hint ? `[${p.hint}]` : '[...]'
      }
      return p.text
    })
    .join('')
  const full = parts.map((p) => p.text).join('')
  return { question, answers, full }
}

export function isCloze(src: string | null | undefined): boolean {
  return !!src && RE.test(src) && ((RE.lastIndex = 0), true)
}
