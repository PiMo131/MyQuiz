/** Language helpers for AI prompts and heuristics. Pure, no React. */

const NAMES: Record<string, string> = {
  nl: 'Dutch',
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  la: 'Latin',
  el: 'Greek',
  tr: 'Turkish',
  pl: 'Polish',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  ru: 'Russian',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  id: 'Indonesian',
  fy: 'Frisian',
}

/** English name of a BCP-47 language code (for prompts). Unknown codes fall back to the code itself. */
export function langName(code: string | undefined | null): string {
  if (!code) return 'the same language as the input'
  const base = code.toLowerCase().split('-')[0]
  return NAMES[base] ?? code
}

const NL_STOP = new Set([
  'de',
  'het',
  'een',
  'en',
  'van',
  'is',
  'zijn',
  'dat',
  'die',
  'niet',
  'met',
  'voor',
  'op',
  'wordt',
  'worden',
  'ook',
  'als',
  'maar',
  'bij',
  'naar',
  'uit',
  'om',
  'aan',
  'er',
  'dan',
  'wat',
  'hoe',
  'wij',
  'je',
  'ik',
  'deze',
  'dit',
  'heeft',
  'hebben',
  'kan',
  'kunnen',
  'door',
  'over',
  'tussen',
  'onder',
  'betekent',
  'noemen',
  'genoemd',
])
const EN_STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'of',
  'is',
  'are',
  'that',
  'this',
  'not',
  'with',
  'for',
  'on',
  'to',
  'in',
  'it',
  'as',
  'but',
  'by',
  'from',
  'at',
  'be',
  'was',
  'were',
  'has',
  'have',
  'can',
  'which',
  'what',
  'how',
  'we',
  'you',
  'they',
  'their',
  'there',
  'about',
  'between',
  'under',
  'means',
  'called',
  'refers',
])

/** Very small stopword-based nl/en detector. Returns 'nl', 'en' or '' when unsure. */
export function detectLang(text: string): 'nl' | 'en' | '' {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 400)
  let nl = 0
  let en = 0
  for (const w of words) {
    if (NL_STOP.has(w)) nl++
    if (EN_STOP.has(w)) en++
  }
  if (nl === 0 && en === 0) return ''
  if (nl > en * 1.3) return 'nl'
  if (en > nl * 1.3) return 'en'
  return ''
}

export const STOPWORDS: ReadonlySet<string> = new Set([...NL_STOP, ...EN_STOP])

export function isStopword(w: string): boolean {
  return STOPWORDS.has(w.toLowerCase())
}
