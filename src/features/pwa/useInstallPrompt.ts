import { useCallback, useEffect, useSyncExternalStore } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

const DISMISS_KEY = 'myquizz.installDismissed'

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    emit()
  })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/i.test(ua) || iPadOs
}

function dismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY)
    return !!v && Date.now() - Number(v) < 14 * 86_400_000
  } catch {
    return false
  }
}

export interface InstallPromptState {
  /** Browser offered a native install prompt. */
  canInstall: boolean
  /** Running as an installed app. */
  standalone: boolean
  /** iOS Safari: no prompt API, show the "Add to Home Screen" hint instead. */
  iosHint: boolean
  /** Either canInstall or iosHint, and not dismissed recently. */
  visible: boolean
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
  dismiss: () => void
}

export function useInstallPrompt(): InstallPromptState {
  const snapshot = useSyncExternalStore(subscribe, () => (deferred ? 'ready' : installed ? 'installed' : 'idle'), () => 'idle')
  const hidden = useSyncExternalStore(subscribe, dismissed, () => true)
  const standalone = isStandalone()
  const canInstall = snapshot === 'ready' && !standalone
  const iosHint = !standalone && !canInstall && isIos()
  useEffect(() => {
    // re-evaluate after mount for environments that fire the event before hydration
    emit()
  }, [])
  const install = useCallback(async () => {
    if (!deferred) return 'unavailable' as const
    const ev = deferred
    await ev.prompt()
    const choice = await ev.userChoice
    deferred = null
    emit()
    return choice.outcome
  }, [])
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
    emit()
  }, [])
  return { canInstall, standalone, iosHint, visible: (canInstall || iosHint) && !hidden, install, dismiss }
}
