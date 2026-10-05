import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, BellOff, Check, Flame, Link2, MoreHorizontal, Settings, Trash2, Trophy, Clock, Info, X } from 'lucide-react'
import { db } from '@/db/db'
import type { Notification } from '@/domain/types'
import { Button, Dropdown, EmptyState, cn } from '@/ui'
import { timeAgo } from '@/features/library'
import { clearNotifications, dismissNotification, markAllRead, markRead } from './notify'
import { runDailyChecks } from './daily'

const ICONS: Record<Notification['type'], { icon: React.ReactNode; cls: string }> = {
  due: { icon: <Clock size={18} />, cls: 'bg-primary-soft text-primary' },
  streak: { icon: <Flame size={18} />, cls: 'bg-highlight-soft text-highlight' },
  achievement: { icon: <Trophy size={18} />, cls: 'bg-accent-soft text-accent' },
  share: { icon: <Link2 size={18} />, cls: 'bg-secondary-soft text-secondary' },
  info: { icon: <Info size={18} />, cls: 'bg-surface-2 text-muted' },
}

export default function NotificationsPage() {
  const { t, i18n } = useTranslation('library')
  const navigate = useNavigate()
  const items = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(100).toArray(), [])
  const unread = items?.filter((n) => !n.read).length ?? 0
  useEffect(() => {
    void runDailyChecks()
  }, [])
  useEffect(() => {
    if (!items?.length) return
    const id = window.setTimeout(() => void markAllRead(), 1500)
    return () => window.clearTimeout(id)
  }, [items?.length])

  const open = (n: Notification) => {
    void markRead(n.id)
    if (n.link) navigate(n.link)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('notifications.title')}</h1>
          <p className="mt-1 text-sm text-muted">{unread > 0 ? t('notifications.unread', { count: unread }) : t('notifications.allRead')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unread > 0 && <Button size="sm" variant="outline" leftIcon={<Check size={15} />} onClick={() => void markAllRead()}>{t('notifications.markAllRead')}</Button>}
          {!!items?.length && <Button size="sm" variant="ghost" leftIcon={<Trash2 size={15} />} onClick={() => void clearNotifications()}>{t('notifications.clearAll')}</Button>}
          <Link to="/settings#notifications"><Button size="sm" variant="ghost" leftIcon={<Settings size={15} />}>{t('common:common.settings')}</Button></Link>
        </div>
      </div>

      {items && items.length === 0 && (
        <div className="mt-8">
          <EmptyState icon={<BellOff />} title={t('notifications.emptyTitle')} description={t('notifications.emptyBody')} action={<Link to="/settings#notifications"><Button variant="secondary" leftIcon={<Bell size={16} />}>{t('settings.dailyReminder')}</Button></Link>} />
        </div>
      )}

      <ul className="card mt-6 divide-y divide-border p-0">
        {items?.map((n) => {
          const ic = ICONS[n.type] ?? ICONS.info
          return (
            <li key={n.id} className={cn('flex items-start gap-3 px-4 py-3 transition', !n.read && 'bg-primary-soft/30')}>
              <span className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', !n.read ? 'bg-primary' : 'bg-transparent')} aria-label={!n.read ? t('notifications.unreadDot') : undefined} />
              <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', ic.cls)}>{ic.icon}</span>
              <button onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                <div className="text-sm font-semibold">{n.title}</div>
                {n.body && <div className="mt-0.5 text-sm text-muted">{n.body}</div>}
                <div className="mt-1 text-xs text-faint">{timeAgo(n.createdAt, i18n.language)}</div>
              </button>
              <Dropdown
                trigger={<button className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label={t('common:common.options')}><MoreHorizontal size={18} /></button>}
                items={[
                  ...(n.link ? [{ label: t('notifications.open'), icon: <Link2 size={16} />, onSelect: () => open(n) }] : []),
                  ...(!n.read ? [{ label: t('notifications.markRead'), icon: <Check size={16} />, onSelect: () => void markRead(n.id) }] : []),
                  { label: t('notifications.dismiss'), icon: <X size={16} />, danger: true, onSelect: () => void dismissNotification(n.id) },
                ]}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
