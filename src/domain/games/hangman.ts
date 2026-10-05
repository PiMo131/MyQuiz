/** Hangman engine: guess a term letter by letter; accent-insensitive comparison. */
import { stripAccents } from '@/domain/text'

export const HANGMAN_MAX_WRONG = 7

export interface HangmanState {
  word: string
  guessed: string[] // normalized letters
  wrong: number
  maxWrong: number
  gaveUp: boolean
}

export function normalizeLetter(ch: string): string {
  return stripAccents(ch).toLowerCase()
}

export function isLetter(ch: string): boolean {
  return /\p{L}/u.test(ch)
}

/** A word is guessable when it contains at least one letter. */
export function isGuessable(word: string): boolean {
  return [...word].some(isLetter)
}

export function createHangman(word: string, maxWrong = HANGMAN_MAX_WRONG): HangmanState {
  return { word: word.trim(), guessed: [], wrong: 0, maxWrong, gaveUp: false }
}

export function letterInWord(word: string, letter: string): boolean {
  const n = normalizeLetter(letter)
  return [...word].some((ch) => isLetter(ch) && normalizeLetter(ch) === n)
}

export type GuessResult = 'hit' | 'miss' | 'repeat' | 'invalid' | 'over'

export function guessLetter(state: HangmanState, letter: string): { state: HangmanState; result: GuessResult } {
  if (isHangmanOver(state)) return { state, result: 'over' }
  if (!letter || [...letter].length !== 1 || !isLetter(letter)) return { state, result: 'invalid' }
  const n = normalizeLetter(letter)
  if (state.guessed.includes(n)) return { state, result: 'repeat' }
  const hit = letterInWord(state.word, n)
  return {
    state: { ...state, guessed: [...state.guessed, n], wrong: state.wrong + (hit ? 0 : 1) },
    result: hit ? 'hit' : 'miss',
  }
}

export function giveUp(state: HangmanState): HangmanState {
  return { ...state, gaveUp: true }
}

export function isWon(state: HangmanState): boolean {
  if (state.gaveUp) return false
  return [...state.word].every((ch) => !isLetter(ch) || state.guessed.includes(normalizeLetter(ch)))
}

export function isLost(state: HangmanState): boolean {
  return state.gaveUp || state.wrong >= state.maxWrong
}

export function isHangmanOver(state: HangmanState): boolean {
  return isWon(state) || isLost(state)
}

export interface MaskedChar {
  ch: string
  /** letter that must be guessed */
  letter: boolean
  shown: boolean
  space: boolean
}

/** Display model: letters hidden until guessed (or game over), punctuation/spaces always shown. */
export function maskedWord(state: HangmanState): MaskedChar[] {
  const reveal = isHangmanOver(state)
  return [...state.word].map((ch) => {
    const letter = isLetter(ch)
    return { ch, letter, space: ch === ' ', shown: !letter || reveal || state.guessed.includes(normalizeLetter(ch)) }
  })
}

/** Score for a solved word: fewer mistakes = more points; longer words give a small bonus. */
export function wordScore(state: HangmanState): number {
  if (!isWon(state)) return 0
  const letters = new Set([...state.word].filter(isLetter).map(normalizeLetter)).size
  return Math.max(10, 100 - state.wrong * 12) + letters * 2
}

/** Keyboard rows for the on-screen keyboard. */
export const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const
