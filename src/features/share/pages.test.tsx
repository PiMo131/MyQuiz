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
})
