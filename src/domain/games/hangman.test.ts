import { describe, expect, it } from 'vitest'
import { createHangman, giveUp, guessLetter, HANGMAN_MAX_WRONG, isGuessable, isLost, isWon, maskedWord, wordScore } from './hangman'

describe('hangman engine', () => {
  it('reveals matching letters accent-insensitively', () => {
    let s = createHangman('café au lait')
    s = guessLetter(s, 'e').state
    const m = maskedWord(s)
    expect(m[3].shown).toBe(true) // é
    expect(m[4].space).toBe(true)
    expect(m[0].shown).toBe(false)
    expect(guessLetter(s, 'É').result).toBe('repeat')
  })
  it('counts wrong guesses and loses at the limit', () => {
    let s = createHangman('abc')
    for (const ch of 'xyzqwvu') s = guessLetter(s, ch).state
    expect(s.wrong).toBe(HANGMAN_MAX_WRONG)
    expect(isLost(s)).toBe(true)
    expect(guessLetter(s, 'a').result).toBe('over')
    expect(maskedWord(s).every((c) => c.shown)).toBe(true)
  })
  it('wins when all letters are guessed', () => {
    let s = createHangman('Zee-hond')
    for (const ch of 'zehond') s = guessLetter(s, ch).state
    expect(isWon(s)).toBe(true)
    expect(wordScore(s)).toBeGreaterThan(100)
  })
  it('ignores invalid input', () => {
    const s = createHangman('abc')
    expect(guessLetter(s, '1').result).toBe('invalid')
    expect(guessLetter(s, 'ab').result).toBe('invalid')
    expect(guessLetter(s, '').result).toBe('invalid')
  })
  it('give up reveals and scores zero', () => {
    const s = giveUp(createHangman('abc'))
    expect(isLost(s)).toBe(true)
    expect(isWon(s)).toBe(false)
    expect(wordScore(s)).toBe(0)
  })
  it('scores fewer points for more mistakes', () => {
    let a = createHangman('ab')
    a = guessLetter(guessLetter(a, 'a').state, 'b').state
    let b = createHangman('ab')
    b = guessLetter(b, 'x').state
    b = guessLetter(guessLetter(b, 'a').state, 'b').state
    expect(wordScore(a)).toBeGreaterThan(wordScore(b))
  })
  it('isGuessable needs a letter', () => {
    expect(isGuessable('123')).toBe(false)
    expect(isGuessable('a1')).toBe(true)
  })
})
