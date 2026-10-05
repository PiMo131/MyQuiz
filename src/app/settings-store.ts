import { create } from 'zustand'
import type { Settings } from '@/domain/types'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { db } from '@/db/db'
import { getSettings, saveSettings } from '@/db/repo'
import i18n, { setLanguage } from './i18n'
import { useTheme } from './theme'

interface SettingsState {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

/** Global settings store (mirrors the Dexie kv row). Features read `settings` and call `update`. */
export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const s = await getSettings()
    // First visit (no stored locale yet): follow the browser language instead of the hard-coded default.
    const stored = (await db.kv.get('settings'))?.value as Partial<Settings> | undefined
    if (!stored?.locale) {
      s.locale = i18n.language.startsWith('nl') ? 'nl' : 'en'
      await saveSettings({ locale: s.locale })
    }
    set({ settings: s, loaded: true })
    setLanguage(s.locale)
    useTheme.getState().setTheme(s.theme)
  },
  update: async (patch) => {
    const s = await saveSettings(patch)
    set({ settings: s })
    if (patch.locale) setLanguage(patch.locale)
    if (patch.theme) useTheme.getState().setTheme(patch.theme)
    void get
  },
}))
