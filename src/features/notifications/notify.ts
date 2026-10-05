import { db } from '@/db/db'
import { newId, now, todayKey } from '@/domain/id'
import type { Notification } from '@/domain/types'

export interface PushNotificationInput {
  type: Notification['type']
  title: string
  body?: string
  link?: string
  /** When set, only one notification with this key is created per day (stored in kv). */
  dedupeKey?: string
}

/** Insert an in-app notification (shows up under the bell and on /notifications). */
export async function pushNotification(input: PushNotificationInput): Promise<Notification | undefined> {
  const { dedupeKey, ...rest } = input
  if (dedupeKey) {
    const kvKey = `notif.dedupe.${dedupeKey}`
    const row = await db.kv.get(kvKey)
    const today = todayKey()
    if (row?.value === today) return undefined
    await db.kv.put({ key: kvKey, value: today })
  }
  const n: Notification = { id: newId(), ...rest, createdAt: now(), read: false }
  await db.notifications.put(n)
  return n
}

export async function markAllRead(): Promise<void> {
  await db.notifications.filter((n) => !n.read).modify({ read: true })
}

export async function markRead(id: string): Promise<void> {
  await db.notifications.update(id, { read: true })
}

export async function dismissNotification(id: string): Promise<void> {
  await db.notifications.delete(id)
}

export async function clearNotifications(): Promise<void> {
  await db.notifications.clear()
}

// ---------- Web Notifications ----------
export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (notificationPermission() === 'unsupported') return 'unsupported'
  try {
    return await window.Notification.requestPermission()
  } catch {
    return window.Notification.permission
  }
}

/** Show a system notification when the user has granted permission. Silent no-op otherwise. */
export async function showSystemNotification(title: string, body?: string, tag?: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.()
    const opts: NotificationOptions = { body, tag, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, badge: `${import.meta.env.BASE_URL}icons/icon-192.png` }
    if (reg?.showNotification) await reg.showNotification(title, opts)
    else new window.Notification(title, opts)
    return true
  } catch {
    return false
  }
}
