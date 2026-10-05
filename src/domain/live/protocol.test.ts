import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/domain/text'
import { codeFromText, formatCode, generateCode, inviteUrl, isClientMessage, isHostMessage, isValidCode, normalizeCode, roomIdFor } from './protocol'

describe('live protocol helpers', () => {
  it('generates valid 6-char codes without ambiguous glyphs', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 200; i++) {
      const c = generateCode(rng)
      expect(isValidCode(c)).toBe(true)
      expect(c).not.toMatch(/[01OI]/)
    }
  })
  it('normalizes and formats codes', () => {
    expect(normalizeCode(' abc-d2f ')).toBe('ABCD2F')
    expect(normalizeCode('abc d2f extra')).toBe('ABCD2F')
    expect(formatCode('ABCD2F')).toBe('ABC-D2F')
    expect(isValidCode('ABCD2F')).toBe(true)
    expect(isValidCode('ABCD0F')).toBe(false)
    expect(isValidCode('ABC')).toBe(false)
  })
  it('builds room ids and invite links', () => {
    expect(roomIdFor('ABCD2F')).toBe('myquizz-abcd2f')
    expect(inviteUrl('ABCD2F', 'https://x.test/MyQuiz/')).toBe('https://x.test/MyQuiz/#/live/join/ABCD2F')
    expect(codeFromText('https://x.test/MyQuiz/#/live/join/ABCD2F')).toBe('ABCD2F')
    expect(codeFromText('abc-d2f')).toBe('ABCD2F')
  })
  it('type guards reject junk', () => {
    expect(isClientMessage({ v: 1, t: 'hello', player: { id: 'a', name: 'A', avatar: '🦊' } })).toBe(true)
    expect(isClientMessage({ v: 2, t: 'hello' })).toBe(false)
    expect(isClientMessage(null)).toBe(false)
    expect(isHostMessage({ v: 1, t: 'view', view: {} })).toBe(true)
    expect(isHostMessage({ v: 1, t: 'answer' })).toBe(false)
  })
})
