import { create } from 'zustand'
import type { Settings } from '@/domain/types'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { getSettings, saveSettings } from '@/db/repo'
import { setLanguage } from './i18n'
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
