/** "Podcast" script for Listen mode: template-based, optionally replaced by an LLM script. */
import type { Card, StudySet } from '@/domain/types'
import { plainText } from '@/domain/text'

export type SegmentKind = 'intro' | 'term' | 'definition' | 'pause' | 'recap' | 'outro' | 'line'

export interface ScriptSegment {
  id: string
  kind: SegmentKind
  text: string
  lang: string
  cardId?: string
  /** Silence after this segment (ms). */
  pauseMs?: number
}

export interface ScriptOptions {
  uiLang: string
  /** Pause between term and definition (ms). */
  thinkPauseMs?: number
  includeRecap?: boolean
  includeIntro?: boolean
}

const T = {
  nl: {
    intro: (title: string, n: number) =>
      `Welkom bij de luisterset "${title}". We gaan ${n} begrippen doornemen. Na elke term volgt een korte pauze, zodat je zelf het antwoord kunt bedenken.`,
    recap: 'Tijd voor een korte herhaling.',
    outro: (title: string) =>
      `Dat was "${title}". Goed gedaan! Luister nog eens of ga verder met een andere studiemodus.`,
    link: (n: number, total: number) => `Begrip ${n} van ${total}.`,
  },
  en: {
    intro: (title: string, n: number) =>
      `Welcome to the listening set "${title}". We will go through ${n} terms. After each term there is a short pause so you can recall the answer yourself.`,
    recap: 'Time for a quick recap.',
    outro: (title: string) =>
      `That was "${title}". Well done! Listen again or continue with another study mode.`,
    link: (n: number, total: number) => `Term ${n} of ${total}.`,
  },
}

export function buildListenScript(
  set: Pick<StudySet, 'title' | 'lang'>,
  cards: readonly Card[],
  opts: ScriptOptions,
): ScriptSegment[] {
  const ui = opts.uiLang.startsWith('nl') ? 'nl' : 'en'
  const t = T[ui]
  const termLang = set.lang.term || ui
  const defLang = set.lang.definition || ui
  const think = opts.thinkPauseMs ?? 2500
  const usable = cards.filter((c) => !c.suspended && plainText(c.term) && plainText(c.definition))
  const segs: ScriptSegment[] = []
  if (opts.includeIntro !== false)
    segs.push({ id: 'intro', kind: 'intro', text: t.intro(set.title, usable.length), lang: ui, pauseMs: 600 })
  usable.forEach((c, i) => {
    segs.push({
      id: `${c.id}:t`,
      kind: 'term',
      cardId: c.id,
      text: plainText(c.term),
      lang: termLang,
      pauseMs: think,
    })
    segs.push({
      id: `${c.id}:d`,
      kind: 'definition',
      cardId: c.id,
      text: plainText(c.definition),
      lang: defLang,
      pauseMs: 900,
    })
    if ((i + 1) % 5 === 0 && i + 1 < usable.length)
      segs.push({ id: `link${i}`, kind: 'line', text: t.link(i + 2, usable.length), lang: ui, pauseMs: 300 })
  })
  if (opts.includeRecap !== false && usable.length > 1) {
    segs.push({ id: 'recap', kind: 'recap', text: t.recap, lang: ui, pauseMs: 500 })
    for (const c of usable) {
      segs.push({
        id: `${c.id}:r`,
        kind: 'recap',
        cardId: c.id,
        text: `${plainText(c.term)}. ${plainText(c.definition)}`,
        lang: termLang === defLang ? termLang : ui,
        pauseMs: 500,
      })
    }
  }
  segs.push({ id: 'outro', kind: 'outro', text: t.outro(set.title), lang: ui })
  return segs
}

/** Total estimated duration in ms at ~2.6 words/s plus pauses. */
export function estimateDuration(segs: readonly ScriptSegment[], rate = 1): number {
  let ms = 0
  for (const s of segs) {
    const words = s.text.trim().split(/\s+/).length
    ms += (words / (2.6 * rate)) * 1000 + (s.pauseMs ?? 0)
  }
  return Math.round(ms)
}
