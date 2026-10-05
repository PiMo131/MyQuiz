import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  const mm = (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })
  Object.defineProperty(globalThis, 'matchMedia', { value: mm, writable: true })
})
// No WebRTC in jsdom: stub the transport so the pages never load trystero.
vi.mock('./transport', () => ({
  LIVE_STRATEGIES: ['nostr', 'nostr-alt', 'custom'],
  ALT_RELAYS: [],
  supportsWebRtc: () => true,
  openRoom: async () => ({
    selfId: 'self',
    send: async () => {},
    onMessage: () => () => {},
    onPeerJoin: () => () => {},
    onPeerLeave: () => () => {},
    peers: () => [],
    relayState: () => 'open',
    leave: async () => {},
  }),
}))

import { Suspense, type ComponentType } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import '@/app/i18n'
import { db } from '@/db/db'
import { addCards, createSet } from '@/db/repo'
import { useSettings } from '@/app/settings-store'

function mount(path: string, Page: ComponentType, route = path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<div>loading</div>}>
        <Routes>
          <Route path={route} element={<Page />} />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  )
}

let setId = ''
beforeAll(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  const s = await createSet({ title: 'Hoofdsteden', description: '' })
  setId = s.id
  await addCards(
    s.id,
    ['Nederland|Amsterdam', 'Frankrijk|Parijs', 'Duitsland|Berlijn', 'Spanje|Madrid', 'Italië|Rome'].map((l) => {
      const [term, definition] = l.split('|')
      return { setId: s.id, term, definition }
    }),
  )
  await useSettings.getState().load()
  await useSettings.getState().update({ displayName: 'Pim', avatar: '🦊', locale: 'nl' })
})

describe('live pages render', () => {
  it('LiveHomePage lists sets and validates codes', async () => {
    const { default: Page } = await import('./LiveHomePage')
    mount('/live', Page)
    expect(screen.getByText('Samen spelen, live')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Hoofdsteden')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Roomcode'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByText('Meedoen'))
    expect(screen.getByText('Een code bestaat uit 6 letters of cijfers.')).toBeInTheDocument()
  })

  it('JoinPage prefills the code and shows the connecting state', async () => {
    const { default: Page } = await import('./JoinPage')
    mount('/live/join/ABCD2F', Page, '/live/join/:code')
    const code = screen.getByLabelText('Roomcode') as HTMLInputElement
    expect(code.value).toBe('ABC-D2F')
    expect((screen.getByLabelText('Je naam') as HTMLInputElement).value).toBe('Pim')
    fireEvent.click(screen.getByRole('button', { name: /Meedoen/ }))
    await waitFor(() => expect(screen.getByText('Verbinden met de host…')).toBeInTheDocument())
  })

  it('HostPage walks from type picker to lobby to countdown', async () => {
    const { default: Page } = await import('./HostPage')
    mount(`/live/host/${setId}`, Page, '/live/host/:setId')
    await waitFor(() => expect(screen.getByText('Kies je speltype')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Classic Live'))
    await waitFor(() => expect(screen.getByLabelText('Roomcode')).toBeInTheDocument())
    expect(screen.getByLabelText('Roomcode').textContent).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/)
    const start = screen.getByRole('button', { name: /Spel starten/ })
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(screen.getByText('Pim')).toBeInTheDocument())
    expect(start).toBeEnabled()
    fireEvent.click(start)
    await waitFor(() => expect(screen.getAllByText('Klaar voor de start!').length).toBeGreaterThan(0))
  })
})
