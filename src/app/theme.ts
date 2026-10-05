import { create } from 'zustand'

export type Theme = 'system' | 'light' | 'dark'
const KEY = 'myquizz.theme'

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0a092d' : '#6366f1')
}

function initial(): Theme {
  try {
    const t = localStorage.getItem(KEY) as Theme | null
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

interface ThemeState {
  theme: Theme
  isDark: boolean
  setTheme: (t: Theme) => void
  toggle: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initial(),
  isDark: document.documentElement.classList.contains('dark'),
  setTheme: (t) => {
    try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
    apply(t)
    set({ theme: t, isDark: document.documentElement.classList.contains('dark') })
  },
  toggle: () => get().setTheme(get().isDark ? 'light' : 'dark'),
}))

apply(useTheme.getState().theme)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useTheme.getState().theme === 'system') useTheme.getState().setTheme('system')
})
