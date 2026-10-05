import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell, BookOpen, Bookmark, FolderPlus, Gamepad2, Home, LayoutGrid, Menu, Moon, Plus, Radio, Search, Settings, Sparkles, Sun, Trophy, X,
} from 'lucide-react'
import { db } from '@/db/db'
import { useTheme } from './theme'
import { useSettings } from './settings-store'
import { Dropdown, cn } from '@/ui'
import { Logo } from './Logo'
import { useStudyTracker } from '@/features/achievements'
import { OfflineIndicator } from '@/features/pwa'

const navItems = [
  { to: '/', key: 'home', icon: Home, end: true },
  { to: '/search', key: 'search', icon: Search },
  { to: '/library', key: 'library', icon: BookOpen },
  { to: '/games', key: 'games', icon: Gamepad2 },
  { to: '/live', key: 'live', icon: Radio },
  { to: '/ai', key: 'ai', icon: Sparkles },
  { to: '/achievements', key: 'achievements', icon: Trophy },
] as const

export function AppShell() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { isDark, toggle } = useTheme()
  const settings = useSettings((s) => s.settings)
  const recent = useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().limit(5).toArray(), [])
  const folders = useLiveQuery(() => db.folders.orderBy('name').toArray(), [])
  const unread = useLiveQuery(() => db.notifications.filter((n) => !n.read).count(), []) ?? 0
  useStudyTracker()
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(false))
    return () => cancelAnimationFrame(id)
  }, [location.pathname])

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-text">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <NavLink to="/" className="flex items-center gap-2.5 text-white">
          <Logo size={30} />
          <span className="text-lg font-bold tracking-tight">{t('app.name')}</span>
        </NavLink>
        <button className="rounded-lg p-1.5 hover:bg-sidebar-hover lg:hidden" onClick={() => setOpen(false)} aria-label={t('common.close')}>
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
        <ul className="space-y-0.5">
          {navItems.map(({ to, key, icon: Icon, ...rest }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={'end' in rest ? rest.end : false}
                className={({ isActive }) =>
                  cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-hover hover:text-white', isActive && 'bg-sidebar-hover text-white')
                }
              >
                <Icon size={18} />
                {t(`nav.${key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
        {!!recent?.length && (
          <>
            <div className="mt-6 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{t('nav.recent')}</div>
            <ul className="space-y-0.5">
              {recent.map((s) => (
                <li key={s.id}>
                  <NavLink to={`/set/${s.id}`} className={({ isActive }) => cn('flex items-center gap-3 truncate rounded-lg px-3 py-1.5 text-sm hover:bg-sidebar-hover hover:text-white', isActive && 'bg-sidebar-hover text-white')}>
                    <Bookmark size={15} className="shrink-0" />
                    <span className="truncate">{s.title || '…'}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-6 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{t('nav.folders')}</div>
        <ul className="space-y-0.5">
          {folders?.map((f) => (
            <li key={f.id}>
              <NavLink to={`/folders/${f.id}`} className={({ isActive }) => cn('flex items-center gap-3 truncate rounded-lg px-3 py-1.5 text-sm hover:bg-sidebar-hover hover:text-white', isActive && 'bg-sidebar-hover text-white')}>
                <LayoutGrid size={15} className="shrink-0" style={{ color: f.color }} />
                <span className="truncate">{f.name}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink to="/library?new=folder" className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm hover:bg-sidebar-hover hover:text-white">
              <FolderPlus size={15} />
              {t('nav.newFolder')}
            </NavLink>
          </li>
        </ul>
      </nav>
      <div className="border-t border-white/10 p-3">
        <NavLink to="/settings" className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-sidebar-hover hover:text-white', isActive && 'bg-sidebar-hover text-white')}>
          <Settings size={18} />
          {t('nav.settings')}
        </NavLink>
      </div>
    </aside>
  )

  return (
    <div className="flex min-h-dvh">
      <div className="sticky top-0 hidden h-dvh shrink-0 lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-dark/60" onClick={() => setOpen(false)} />
          <div className="relative h-full">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 hover:bg-surface-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
            <Menu size={20} />
          </button>
          <form
            className="relative hidden flex-1 sm:block"
            onSubmit={(e) => {
              e.preventDefault()
              const q = new FormData(e.currentTarget).get('q')?.toString().trim()
              navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
            }}
          >
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input name="q" placeholder={t('common.search') + '…'} className="h-10 w-full max-w-xl rounded-full border border-border bg-surface pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </form>
          <div className="ml-auto flex items-center gap-1.5">
            <Dropdown
              trigger={
                <button className="grid h-9 w-9 place-items-center rounded-full bg-primary text-white hover:bg-primary-600" aria-label={t('nav.create')}>
                  <Plus size={18} />
                </button>
              }
              items={[
                { label: t('nav.createSet'), icon: <BookOpen size={16} />, onSelect: () => navigate('/create') },
                { label: t('nav.createFolder'), icon: <FolderPlus size={16} />, onSelect: () => navigate('/library?new=folder') },
                { label: t('nav.practiceTest'), icon: <LayoutGrid size={16} />, onSelect: () => navigate('/ai/practice-test') },
                { label: t('nav.studyGuide'), icon: <Sparkles size={16} />, onSelect: () => navigate('/ai/study-guide') },
                { divider: true, label: '' },
                { label: t('common.import'), icon: <Plus size={16} />, onSelect: () => navigate('/import') },
              ]}
            />
            <NavLink to="/notifications" className="relative rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label={t('nav.notifications')}>
              <Bell size={20} />
              {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[10px] font-bold text-white">{unread}</span>}
            </NavLink>
            <button onClick={toggle} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label={isDark ? t('nav.lightMode') : t('nav.darkMode')}>
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <Dropdown
              trigger={
                <button className="ml-1 flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 hover:bg-surface-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-base">{settings.avatar || '🦊'}</span>
                  <span className="hidden max-w-28 truncate text-sm font-medium sm:block">{settings.displayName || t('nav.profile')}</span>
                </button>
              }
              items={[
                { label: t('nav.achievements'), icon: <Trophy size={16} />, onSelect: () => navigate('/achievements') },
                { label: t('nav.stats'), icon: <LayoutGrid size={16} />, onSelect: () => navigate('/stats') },
                { label: t('nav.settings'), icon: <Settings size={16} />, onSelect: () => navigate('/settings') },
                { divider: true, label: '' },
                { label: isDark ? t('nav.lightMode') : t('nav.darkMode'), icon: isDark ? <Sun size={16} /> : <Moon size={16} />, onSelect: toggle },
              ]}
            />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <OfflineIndicator />
      </div>
    </div>
  )
}
