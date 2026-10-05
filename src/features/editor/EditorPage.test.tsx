import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import '@/app/i18n'
import { db } from '@/db/db'
import { addCards, createSet, getCards, wipeAll } from '@/db/repo'
import EditorPage from './EditorPage'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/create" element={<EditorPage />} />
        <Route path="/set/:setId/edit" element={<EditorPage />} />
        <Route path="/set/:setId" element={<div>set page</div>} />
        <Route path="/set/:setId/flashcards" element={<div>flashcards</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('EditorPage', () => {
  beforeEach(async () => {
    await wipeAll()
    sessionStorage.clear()
  })

  it('renders two empty cards and autosaves a draft', async () => {
    renderAt('/create')
    const title = await screen.findByLabelText(/titel|title/i)
    expect(screen.getAllByLabelText(/^term$/i)).toHaveLength(2)
    fireEvent.change(title, { target: { value: 'Mijn set' } })
    const [term] = screen.getAllByLabelText(/^term$/i)
    fireEvent.change(term, { target: { value: 'hond' } })
    await waitFor(async () => expect(await db.sets.count()).toBe(1), { timeout: 4000 })
    const set = (await db.sets.toArray())[0]
    expect(set).toMatchObject({ title: 'Mijn set', draft: true })
    await waitFor(async () => expect((await getCards(set.id)).length).toBe(1), { timeout: 4000 })
    expect(screen.getByText(/zojuist opgeslagen|saved just now/i)).toBeInTheDocument()
  })

  it('adds, deletes cards and creates the set', async () => {
    renderAt('/create')
    const title = await screen.findByLabelText(/titel|title/i)
    fireEvent.change(title, { target: { value: 'Dieren' } })
    fireEvent.click(screen.getByRole('button', { name: /kaart toevoegen|add a card/i }))
    expect(screen.getAllByLabelText(/^term$/i)).toHaveLength(3)
    fireEvent.click(screen.getAllByRole('button', { name: /kaart verwijderen|delete card/i })[2])
    const terms = screen.getAllByLabelText(/^term$/i)
    expect(terms).toHaveLength(2)
    const defs = screen.getAllByLabelText(/^definitie$|^definition$/i)
    fireEvent.change(terms[0], { target: { value: 'hond' } })
    fireEvent.change(defs[0], { target: { value: 'dog' } })
    fireEvent.change(terms[1], { target: { value: 'kat' } })
    fireEvent.change(defs[1], { target: { value: 'cat' } })
    fireEvent.click(screen.getByRole('button', { name: /^maken$|^create$/i }))
    await screen.findByText('set page', undefined, { timeout: 4000 })
    const sets = await db.sets.toArray()
    expect(sets).toHaveLength(1)
    expect(sets[0].draft).toBe(false)
    const cards = await getCards(sets[0].id)
    expect(cards.map((c) => [c.term, c.definition])).toEqual([
      ['hond', 'dog'],
      ['kat', 'cat'],
    ])
  })

  it('loads an existing set for editing', async () => {
    const set = await createSet({ title: 'Bestaand', tags: ['x'] })
    await addCards(set.id, [
      { setId: set.id, term: 'a', definition: 'b', hint: 'h' },
      { setId: set.id, term: 'c', definition: 'd' },
    ])
    renderAt(`/set/${set.id}/edit`)
    expect(await screen.findByDisplayValue('Bestaand')).toBeInTheDocument()
    expect(screen.getByDisplayValue('a')).toBeInTheDocument()
    expect(screen.getByDisplayValue('d')).toBeInTheDocument()
    expect(screen.getByText('#x')).toBeInTheDocument()
    // swap sides
    fireEvent.click(screen.getByRole('button', { name: /omwisselen|swap/i }))
    expect(screen.getAllByLabelText(/^term$/i)[0]).toHaveValue('b')
  })
})
