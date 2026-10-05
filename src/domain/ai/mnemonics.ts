/** Tiny mnemonic helpers: first-letter cues and acrostics. */
import { plainText } from '@/domain/text'
import { isStopword } from './lang'

export function firstLetters(words: readonly string[]): string[] {
  return words.map((w) => plainText(w).trim().charAt(0).toUpperCase()).filter(Boolean)
}

/** Acrostic string "F-O-T-O" from a list of terms. */
export function acrostic(terms: readonly string[]): string {
  return firstLetters(terms).join('-')
}

/** A cue sentence for a single term/definition pair, in nl or en. */
export function mnemonicCue(term: string, definition: string, lang: string): string {
  const nl = lang.startsWith('nl')
  const t = plainText(term)
  const d = plainText(definition)
  const first = t.charAt(0).toUpperCase()
  const len = t.replace(/\s+/g, '').length
  const sharedRoot = sharedStem(t, d)
  if (sharedRoot) {
    return nl
      ? `Let op het gedeelde stuk "${sharedRoot}" in term en definitie.`
      : `Notice the shared part "${sharedRoot}" in term and definition.`
  }
  const words = d.split(/\s+/).filter((w) => w.length > 3 && !isStopword(w))
  const keyWord = words.find((w) => w.charAt(0).toUpperCase() === first)
  if (keyWord) {
    return nl ? `Beide beginnen met een ${first}: ${t} ↔ ${keyWord}.` : `Both start with ${first}: ${t} ↔ ${keyWord}.`
  }
  return nl
    ? `Onthoud: begint met "${first}", ${len} letters, ${t.split(/\s+/).length === 1 ? 'één woord' : `${t.split(/\s+/).length} woorden`}.`
    : `Remember: starts with "${first}", ${len} letters, ${t.split(/\s+/).length === 1 ? 'one word' : `${t.split(/\s+/).length} words`}.`
}

function sharedStem(a: string, b: string): string | null {
  const wa = a.toLowerCase().split(/\s+/)
  const wb = b.toLowerCase().split(/\s+/)
  for (const x of wa) {
    if (x.length < 5) continue
    for (const y of wb) {
      if (y.length < 5) continue
      const stem = commonPrefix(x, y)
      if (stem.length >= 5) return stem
    }
  }
  return null
}

function commonPrefix(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return a.slice(0, i)
}

/** Build an acrostic mnemonic for a list of terms, with a human sentence suggestion. */
export function acrosticMnemonic(terms: readonly string[], lang: string): { letters: string; hint: string } {
  const letters = acrostic(terms)
  const nl = lang.startsWith('nl')
  const hint = nl
    ? `Maak een zin waarvan de woorden beginnen met ${letters.split('-').join(', ')}.`
    : `Make a sentence whose words start with ${letters.split('-').join(', ')}.`
  return { letters, hint }
}
