/** Language list, special character sets and a small language-detection heuristic for the editor. */

export interface LanguageOption {
  code: string // BCP-47 or special: 'chem' | 'math'
  /** English name, used for search; the displayed label comes from i18n `languages.<code>`. */
  name: string
  chars?: string[]
}

export const SPECIAL_CHARS: Record<string, string[]> = {
  nl: ['á', 'à', 'â', 'ä', 'ç', 'é', 'è', 'ê', 'ë', 'í', 'ï', 'ó', 'ô', 'ö', 'ú', 'ü', 'ĳ'],
  en: ['’', '“', '”', '—', '…'],
  de: ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'],
  fr: ['à', 'â', 'æ', 'ç', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'œ', 'ù', 'û', 'ü', 'ÿ', '«', '»'],
  es: ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¿', '¡'],
  it: ['à', 'è', 'é', 'ì', 'ò', 'ó', 'ù'],
  pt: ['á', 'à', 'â', 'ã', 'ç', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú'],
  pl: ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'],
  tr: ['ç', 'ğ', 'ı', 'İ', 'ö', 'ş', 'ü'],
  sv: ['å', 'ä', 'ö'],
  da: ['æ', 'ø', 'å'],
  no: ['æ', 'ø', 'å'],
  fi: ['ä', 'ö', 'å'],
  cs: ['á', 'č', 'ď', 'é', 'ě', 'í', 'ň', 'ó', 'ř', 'š', 'ť', 'ú', 'ů', 'ý', 'ž'],
  hu: ['á', 'é', 'í', 'ó', 'ö', 'ő', 'ú', 'ü', 'ű'],
  ro: ['ă', 'â', 'î', 'ș', 'ț'],
  is: ['á', 'ð', 'é', 'í', 'ó', 'ú', 'ý', 'þ', 'æ', 'ö'],
  la: ['ā', 'ē', 'ī', 'ō', 'ū'],
  el: ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'ς', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'],
  ru: ['ё', 'ъ', 'ь', 'э', 'ю', 'я'],
  vi: ['ă', 'â', 'đ', 'ê', 'ô', 'ơ', 'ư'],
  chem: ['→', '⇌', '⇄', '↑', '↓', 'Δ', '°', '·', '₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '⁺', '⁻', '²', '³', 'α', 'β', 'γ', 'λ', 'μ'],
  math: ['±', '×', '÷', '≠', '≈', '≤', '≥', '√', '∞', 'π', 'Σ', '∫', '∂', 'Δ', '∈', '∉', '∪', '∩', '⊂', '∅', '∠', '°', '²', '³', 'ⁿ', '½', '¼', '¾', '→', '⇒', '⇔', '∀', '∃', 'θ', 'λ', 'μ', 'σ', 'ω'],
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'la', name: 'Latin' },
  { code: 'el', name: 'Greek' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'cs', name: 'Czech' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ro', name: 'Romanian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'ru', name: 'Russian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'id', name: 'Indonesian' },
  { code: 'sw', name: 'Swahili' },
  { code: 'fy', name: 'Frisian' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'chem', name: 'Chemistry' },
  { code: 'math', name: 'Math' },
].map((l) => ({ ...l, chars: SPECIAL_CHARS[l.code] }))

export const LANGUAGE_CODES = new Set(LANGUAGES.map((l) => l.code))

export function charsFor(code: string | undefined): string[] {
  return (code && SPECIAL_CHARS[code]) || []
}

/** Common function words per language for detection (lower case). */
const STOPWORDS: Record<string, string[]> = {
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'in', 'op', 'dat', 'die', 'niet', 'met', 'zijn', 'voor', 'ook', 'als', 'maar', 'om', 'aan', 'er', 'wordt', 'door', 'naar', 'bij', 'uit', 'je', 'ik', 'we', 'wat', 'hoe'],
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'that', 'it', 'for', 'with', 'as', 'on', 'are', 'this', 'be', 'by', 'or', 'an', 'from', 'which', 'you', 'not', 'at', 'have', 'was', 'what', 'who', 'how'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'ich', 'zu', 'mit', 'sich', 'auf', 'für', 'auch', 'es', 'den', 'dem', 'von', 'im', 'wird', 'sind', 'oder', 'aber', 'wie', 'was', 'wer'],
  fr: ['le', 'la', 'les', 'et', 'des', 'est', 'un', 'une', 'du', 'de', 'que', 'qui', 'dans', 'pour', 'pas', 'sur', 'au', 'avec', 'ce', 'il', 'elle', 'nous', 'vous', 'sont', 'ne', 'je', 'mais', 'où', 'très'],
  es: ['el', 'la', 'los', 'las', 'y', 'de', 'que', 'es', 'un', 'una', 'en', 'por', 'con', 'para', 'del', 'se', 'no', 'su', 'al', 'lo', 'como', 'más', 'pero', 'son', 'muy', 'qué', 'yo'],
  it: ['il', 'la', 'di', 'che', 'è', 'e', 'un', 'una', 'per', 'non', 'in', 'con', 'sono', 'del', 'della', 'gli', 'le', 'si', 'da', 'al', 'anche', 'come', 'ma', 'più', 'io', 'molto', 'dove'],
}

/** Detect language from text (nl/en/de/fr/es/it). Returns '' when unsure. */
export function detectLanguage(text: string): string {
  const t = text.toLowerCase()
  if (!t.trim()) return ''
  if (/[Ѐ-ӿ]/.test(t)) return 'ru'
  if (/[Ͱ-Ͽ]/.test(t)) return 'el'
  if (/[؀-ۿ]/.test(t)) return 'ar'
  if (/[֐-׿]/.test(t)) return 'he'
  if (/[぀-ヿ]/.test(t)) return 'ja'
  if (/[가-힯]/.test(t)) return 'ko'
  if (/[一-鿿]/.test(t)) return 'zh'
  const words = t.split(/[^\p{L}'’]+/u).filter(Boolean)
  if (!words.length) return ''
  const scores: Record<string, number> = { nl: 0, en: 0, de: 0, fr: 0, es: 0, it: 0 }
  for (const w of words) for (const [lang, list] of Object.entries(STOPWORDS)) if (list.includes(w)) scores[lang] += 1
  // character hints
  if (/ß/.test(t)) scores.de += 2
  if (/[ñ¿¡]/.test(t)) scores.es += 2
  if (/[œçà]/.test(t)) scores.fr += 1
  if (/ĳ|ij/.test(t)) scores.nl += 1
  if (/[àèòù]\b/.test(t)) scores.it += 1
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [best, bestScore] = sorted[0]
  const second = sorted[1][1]
  if (bestScore === 0) return ''
  if (words.length >= 6 && bestScore === second) return ''
  return best
}

/** Search the language list by (English) name, code or a localized label. */
export function filterLanguages(query: string, label: (code: string) => string): LanguageOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return LANGUAGES
  return LANGUAGES.filter((l) => l.name.toLowerCase().includes(q) || l.code === q || label(l.code).toLowerCase().includes(q))
}
