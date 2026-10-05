import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

// Namespaces are loaded eagerly from src/locales/<lng>/<ns>.json via Vite glob.
const modules = import.meta.glob('../locales/*/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, unknown>>

const resources: Record<string, Record<string, Record<string, unknown>>> = {}
for (const [path, data] of Object.entries(modules)) {
  const m = /locales\/([a-z]{2})\/([a-z0-9-]+)\.json$/i.exec(path)
  if (!m) continue
  const [, lng, ns] = m
  resources[lng] ??= {}
  resources[lng][ns] = data
}

export const SUPPORTED_LANGS = ['nl', 'en'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGS],
    ns: Object.keys(resources.en ?? {}),
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'myquizz.lang', caches: ['localStorage'] },
    returnNull: false,
  })

export function setLanguage(lng: Lang) {
  void i18n.changeLanguage(lng)
  document.documentElement.lang = lng
}

export default i18n
