import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  const mm = (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })
  Object.defineProperty(globalThis, 'matchMedia', { value: mm, writable: true })
  class IO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(globalThis, 'IntersectionObserver', { value: IO, writable: true })
})
import { Suspense, type ComponentType } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import '@/app/i18n'
import { db } from '@/db/db'
import { addCards, createFolder, createSet, recordOutcome } from '@/db/repo'
import { useSettings } from '@/app/settings-store'


async function mount(path: string, Page: ComponentType, route = path) {
  render(
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
let folderId = ''
beforeAll(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  const f = await createFolder('Talen', null, '#6366f1')
  folderId = f.id
  const s = await createSet({ title: 'Frans hoofdstuk 2', description: 'Woordjes', tags: ['frans'], folderId: f.id })
  setId = s.id
  const cards = await addCards(s.id, [{ setId: s.id, term: 'le chat', definition: 'de kat' }, { setId: s.id, term: 'le chien', definition: 'de hond' }])
  await recordOutcome(cards[0], true, 'learn')
  await useSettings.getState().load()
  await useSettings.getState().update({ displayName: 'Pim', onboarded: true, locale: 'nl' })
})

describe('feature D pages render', () => {
  it('HomePage', async () => {
    const { default: HomePage } = await import('./HomePage')
    await mount('/', HomePage)
    await waitFor(() => expect(screen.getByText(/Pim/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Frans hoofdstuk 2')).toBeInTheDocument())
  })
  it('LibraryPage', async () => {
    const { default: LibraryPage } = await import('@/features/library/LibraryPage')
    await mount('/library', LibraryPage)
    await waitFor(() => expect(screen.getByText('Frans hoofdstuk 2')).toBeInTheDocument())
    expect(screen.getByText('Jouw bibliotheek')).toBeInTheDocument()
  })
  it('FolderPage', async () => {
    const { default: FolderPage } = await import('@/features/library/FolderPage')
    await mount(`/folders/${folderId}`, FolderPage, '/folders/:folderId')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Talen' })).toBeInTheDocument())
  })
  it('SearchPage', async () => {
    const { default: SearchPage } = await import('@/features/search/SearchPage')
    await mount('/search?q=chat', SearchPage, '/search')
    await waitFor(() => expect(screen.getByText(/Resultaten voor/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByText('chat').length).toBeGreaterThan(0))
  })
  it('SettingsPage', async () => {
    const { default: SettingsPage } = await import('@/features/settings/SettingsPage')
    await mount('/settings', SettingsPage)
    expect(screen.getByRole('heading', { name: 'Instellingen' })).toBeInTheDocument()
    expect(screen.getByText('Gewenste retentie')).toBeInTheDocument()
  })
  it('AchievementsPage', async () => {
    const { default: AchievementsPage } = await import('@/features/achievements/AchievementsPage')
    await mount('/achievements', AchievementsPage)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Prestaties' })).toBeInTheDocument())
    await waitFor(() => expect(db.achievements.count()).resolves.toBeGreaterThan(0))
  })
  it('StatsPage', async () => {
    const { default: StatsPage } = await import('@/features/achievements/StatsPage')
    await mount('/stats', StatsPage)
    await waitFor(() => expect(screen.getByText('Beheersing per set')).toBeInTheDocument())
  })
  it('NotificationsPage', async () => {
    const { default: NotificationsPage } = await import('@/features/notifications/NotificationsPage')
    await mount('/notifications', NotificationsPage)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Meldingen' })).toBeInTheDocument())
    void setId
  })
})
