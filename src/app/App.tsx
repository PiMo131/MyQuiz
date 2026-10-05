import { Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AppShell } from './AppShell'
import { routes } from './routes'
import { useSettings } from './settings-store'
import { Toaster } from '@/ui'
import { seedDemoIfEmpty } from './seed'
import { PwaUpdater } from './PwaUpdater'
import { NotFound } from './NotFound'

function Spinner() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

export default function App() {
  const load = useSettings((s) => s.load)
  const loaded = useSettings((s) => s.loaded)
  const { i18n } = useTranslation()
  useEffect(() => {
    void (async () => {
      await seedDemoIfEmpty(i18n.language.startsWith('nl') ? 'nl' : 'en')
      await load()
    })()
  }, [load, i18n.language])
  if (!loaded) return <Spinner />
  const shellRoutes = routes.filter((r) => r.shell !== false)
  const fullRoutes = routes.filter((r) => r.shell === false)
  return (
    <HashRouter>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<AppShell />}>
            {shellRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={<r.component />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Route>
          {fullRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={<r.component />} />
          ))}
        </Routes>
      </Suspense>
      <Toaster />
      <PwaUpdater />
    </HashRouter>
  )
}
