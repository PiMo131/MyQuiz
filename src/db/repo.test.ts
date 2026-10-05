import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addCards, createSet, deleteSet, getCards, getSettings, recordOutcome, replaceCards, saveSettings, wipeAll } from './repo'

describe('repo', () => {
  beforeEach(async () => {
    await wipeAll()
  })

  it('creates a set with cards in order', async () => {
    const s = await createSet({ title: 'T' })
    await addCards(s.id, [
      { setId: s.id, term: 'a', definition: '1' },
      { setId: s.id, term: 'b', definition: '2' },
    ])
    const cards = await getCards(s.id)
    expect(cards.map((c) => c.term)).toEqual(['a', 'b'])
    expect(cards[1].position).toBe(1)
  })

  it('replaces cards and deletes stale ones', async () => {
    const s = await createSet({ title: 'T' })
    const [a] = await addCards(s.id, [{ setId: s.id, term: 'a', definition: '1' }, { setId: s.id, term: 'b', definition: '2' }])
    await replaceCards(s.id, [{ id: a.id, setId: s.id, term: 'a2', definition: '1' }])
    const cards = await getCards(s.id)
    expect(cards).toHaveLength(1)
    expect(cards[0].term).toBe('a2')
  })

  it('records outcomes and buckets', async () => {
    const s = await createSet({ title: 'T' })
    const [a] = await addCards(s.id, [{ setId: s.id, term: 'a', definition: '1' }])
    let p = await recordOutcome(a, true, 'learn')
    expect(p.bucket).toBe('learning')
    p = await recordOutcome(a, true, 'learn')
    expect(p.bucket).toBe('known')
    expect(await db.revlog.count()).toBe(2)
  })

  it('deletes set cascade', async () => {
    const s = await createSet({ title: 'T' })
    const [a] = await addCards(s.id, [{ setId: s.id, term: 'a', definition: '1' }])
    await recordOutcome(a, true, 'learn')
    await deleteSet(s.id)
    expect(await db.cards.count()).toBe(0)
    expect(await db.progress.count()).toBe(0)
    expect(await db.revlog.count()).toBe(0)
  })

  it('merges settings', async () => {
    await saveSettings({ locale: 'en', srs: { newPerDay: 5 } as never })
    const s = await getSettings()
    expect(s.locale).toBe('en')
    expect(s.srs.newPerDay).toBe(5)
    expect(s.srs.requestRetention).toBe(0.9)
  })
})
