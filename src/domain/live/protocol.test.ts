import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@/domain/text'
import { MAX_NAME_LENGTH, codeFromText, formatCode, generateCode, inviteUrl, isClientMessage, isHostMessage, isValidCode, normalizeCode, roomIdFor, sanitizeName } from './protocol'

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

describe('live protocol hardening', () => {
  it('client guards require well-typed payloads', () => {
    expect(isClientMessage({ v: 1, t: 'hello' })).toBe(false)
    expect(isClientMessage({ v: 1, t: 'hello', player: null })).toBe(false)
    expect(isClientMessage({ v: 1, t: 'hello', player: { id: 1, name: 'A', avatar: 'x' } })).toBe(false)
    expect(isClientMessage({ v: 1, t: 'answer', questionId: 'q', choice: 1 })).toBe(true)
    expect(isClientMessage({ v: 1, t: 'answer', questionId: 'q', choice: '1' })).toBe(false)
    expect(isClientMessage({ v: 1, t: 'answer', questionId: 'q', choice: NaN })).toBe(false)
    expect(isClientMessage({ v: 1, t: 'power', kind: 'nuke' })).toBe(false)
    expect(isClientMessage({ v: 1, t: 'power', kind: 'saver' })).toBe(true)
    expect(isClientMessage({ v: 1, t: 'match', matched: 3, done: false })).toBe(true)
    expect(isClientMessage({ v: 1, t: 'match', matched: '3', done: false })).toBe(false)
    expect(isClientMessage({ v: 1, t: 'bye' })).toBe(true)
    expect(isClientMessage({ v: 1, t: 'evil' })).toBe(false)
  })
  it('host guards require a view object and a known end reason', () => {
    expect(isHostMessage({ v: 1, t: 'welcome', set: '', title: 'T', view: {} })).toBe(true)
    expect(isHostMessage({ v: 1, t: 'welcome', set: '', title: 'T' })).toBe(false)
    expect(isHostMessage({ v: 1, t: 'view' })).toBe(false)
    expect(isHostMessage({ v: 1, t: 'view', view: 'str' })).toBe(false)
    expect(isHostMessage({ v: 1, t: 'end', reason: 'kicked' })).toBe(true)
    expect(isHostMessage({ v: 1, t: 'end', reason: 'other' })).toBe(false)
  })
  it('sanitizes player names: control chars stripped, length capped, fallback on empty', () => {
    expect(sanitizeName('  Ann\u0000\u200b\u202e  Lee\n')).toBe('Ann Lee')
    expect(sanitizeName('x'.repeat(100))).toHaveLength(MAX_NAME_LENGTH)
    expect(sanitizeName('\u0007\u0008')).toBe('Player')
    expect(sanitizeName(42)).toBe('Player')
    expect(sanitizeName('🦊', '🙂', 8)).toBe('🦊')
  })
})
