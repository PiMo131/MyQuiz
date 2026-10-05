import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import '@/app/i18n'
import { addCards, createSet, getCards, wipeAll } from '@/db/repo'
import { db } from '@/db/db'
import { encodeSet } from '@/domain/share-codec'
import { ShareModal } from './ShareModal'
import { CalendarMenuItems } from './calendar'
import EmbedPage from './EmbedPage'
import PrintPage from './PrintPage'
import ImportPage from './ImportPage'
import AiImportPage from './AiImportPage'
import { parseChatbotOutput } from '@/domain/import-export/parsers'

/** Chatbot-style payload without any ids (the sanitizer must invent them). */
const AI_JSON = JSON.stringify({
  format: 'myquizz-set',
  version: 1,
  set: { title: 'Cellen', lang: { term: 'nl', definition: 'nl' } },
  cards: [
    { term: 'mitochondrium', definition: 'maakt ATP', hint: 'energiecentrale', distractors: ['ribosoom', 'kern', 'golgi'] },
    { term: 'ribosoom', definition: 'maakt eiwitten' },
  ],
})

async function seed() {
  const set = await createSet({ title: 'Dieren', lang: { term: 'nl', definition: 'en' } })
  const cards = await addCards(set.id, [
    { setId: set.id, term: 'hond', definition: 'dog' },
    { setId: set.id, term: 'kat', definition: 'cat', hint: 'miauw' },
  ])
  return { set, cards }
}

describe('share pages', () => {
  beforeEach(async () => {
    await wipeAll()
  })

  it('ShareModal shows link, actions and embed snippet', async () => {
    const { set } = await seed()
    render(<ShareModal open onClose={() => {}} setId={set.id} />)
    const link = (await screen.findByLabelText(/deellink|share link/i)) as HTMLInputElement
    expect(link.value).toContain('#/import?d=1.')
    fireEvent.click(screen.getByRole('button', { name: /insluiten|embed/i }))
    const snippet = (await screen.findByLabelText(/insluitcode|embed code/i)) as HTMLTextAreaElement
    expect(snippet.value).toContain('<iframe')
    expect(snippet.value).toContain('#/embed/1.')
    expect(CalendarMenuItems(set.id, set.title)).toHaveLength(3)
  })

  it('EmbedPage flips and navigates', async () => {
    const { set, cards } = await seed()
    const code = encodeSet(set, cards)
    render(
      <MemoryRouter initialEntries={[`/embed/${code}`]}>
        <Routes>
          <Route path="/embed/:code" element={<EmbedPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('hond')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /volgende|next/i }))
    expect(screen.getByText('kat')).toBeInTheDocument()
    expect(screen.getByText(/miauw/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /definitie tonen|show definition/i }))
    expect(screen.getByText('cat')).toBeInTheDocument()
  })

  it('PrintPage renders cards in the chosen layout', async () => {
    const { set } = await seed()
    render(
      <MemoryRouter initialEntries={[`/set/${set.id}/print`]}>
        <Routes>
          <Route path="/set/:setId/print" element={<PrintPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('hond')).toBeInTheDocument()
    expect(screen.getByText('dog')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue(/kaartjes|index cards/i), { target: { value: 'termsOnly' } })
    expect(screen.queryByText('dog')).not.toBeInTheDocument()
    expect(screen.getByText('kat')).toBeInTheDocument()
  })

  it('ImportPage decodes ?d= and imports; offers update when externalId exists', async () => {
    const { set, cards } = await seed()
    const code = encodeSet(set, cards)
    await wipeAll()
    const ui = (
      <MemoryRouter initialEntries={[`/import?d=${code}`]}>
        <Routes>
          <Route path="/import" element={<ImportPage />} />
          <Route path="/set/:setId" element={<div>set page</div>} />
        </Routes>
      </MemoryRouter>
    )
    const r = render(ui)
    expect(await screen.findByDisplayValue('Dieren')).toBeInTheDocument()
    expect(screen.getByText('hond')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^importeren$|^import$/i }))
    await screen.findByText('set page', undefined, { timeout: 4000 })
    const sets = await db.sets.toArray()
    expect(sets).toHaveLength(1)
    expect(sets[0].externalId).toBe(set.id)
    expect(await getCards(sets[0].id)).toHaveLength(2)
    r.unmount()

    // second visit: existing set detected
    render(ui)
    expect(await screen.findByText(/je hebt deze set al|you already have this set/i, undefined, { timeout: 4000 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /bestaande set bijwerken|update existing set/i }))
    await screen.findByText('set page', undefined, { timeout: 4000 })
    expect(await db.sets.count()).toBe(1)
  })

  it('importing the same id-less JSON twice creates two independent sets', async () => {
    const importOnce = async () => {
      const r = render(
        <MemoryRouter initialEntries={[{ pathname: '/import', state: { parsed: parseChatbotOutput('```json\n' + AI_JSON + '\n```') } }]}>
          <Routes>
            <Route path="/import" element={<ImportPage />} />
            <Route path="/set/:setId" element={<div>set page</div>} />
          </Routes>
        </MemoryRouter>,
      )
      expect(await screen.findByDisplayValue('Cellen')).toBeInTheDocument()
      expect(screen.getByText('mitochondrium')).toBeInTheDocument()
      // no "already have this set" offer: a generated id is not an externalId
      expect(screen.queryByText(/je hebt deze set al|you already have this set/i)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /^importeren$|^import$/i }))
      await screen.findByText('set page', undefined, { timeout: 4000 })
      r.unmount()
    }
    await importOnce()
    await importOnce()
    const sets = await db.sets.toArray()
    expect(sets).toHaveLength(2)
    expect(sets.every((s) => s.externalId === undefined)).toBe(true)
    const [a, b] = await Promise.all(sets.map((s) => getCards(s.id)))
    expect(a).toHaveLength(2)
    expect(b).toHaveLength(2)
    expect(a[0].distractors).toEqual(['ribosoom', 'kern', 'golgi'])
    expect(new Set([...a, ...b].map((c) => c.id)).size).toBe(4)
  })

  it('AiImportPage hands the parsed answer to ImportPage', async () => {
    render(
      <MemoryRouter initialEntries={['/import/ai']}>
        <Routes>
          <Route path="/import/ai" element={<AiImportPage />} />
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: /importeren via je eigen ai|import with your own ai/i })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    const box = screen.getByLabelText(/antwoord van de chatbot|chatbot answer/i)
    fireEvent.change(box, { target: { value: 'nonsense without separators' } })
    fireEvent.click(screen.getByRole('button', { name: /import bekijken|preview import/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    fireEvent.change(box, { target: { value: 'Alsjeblieft:\n```json\n' + AI_JSON + '\n```' } })
    fireEvent.click(screen.getByRole('button', { name: /import bekijken|preview import/i }))
    expect(await screen.findByDisplayValue('Cellen')).toBeInTheDocument()
    expect(screen.getByText('ribosoom')).toBeInTheDocument()
  })
})
