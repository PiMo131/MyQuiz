import i18n from '@/app/i18n'
import { db } from '@/db/db'
import { getSettings } from '@/db/repo'
import { todayKey } from '@/domain/id'
import { dailyPlan } from '@/domain/srs'
import { emptyStreak, isStreakAtRisk } from '@/domain/achievements'
import { pushNotification, showSystemNotification } from './notify'

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { ns: 'library', ...opts }) as string

export interface DueSummary {
  due: number
  fresh: number
  perSet: Array<{ setId: string; due: number; fresh: number }>
}

/** Due + new counts across all sets, using today's daily plan per set. */
export async function dueSummary(): Promise<DueSummary> {
  const settings = await getSettings()
  const all = await db.progress.toArray()
  const bySet = new Map<string, typeof all>()
  for (const p of all) {
    const arr = bySet.get(p.setId) ?? []
    arr.push(p)
    bySet.set(p.setId, arr)
  }
  const perSet: DueSummary['perSet'] = []
  let due = 0
  let fresh = 0
  for (const [setId, list] of bySet) {
    const plan = dailyPlan(list, settings.srs)
    if (plan.due.length || plan.fresh.length) perSet.push({ setId, due: plan.due.length, fresh: plan.fresh.length })
    due += plan.due.length
    fresh += plan.fresh.length
  }
  perSet.sort((a, b) => b.due - a.due || b.fresh - a.fresh)
  return { due, fresh, perSet }
}

let ranFor = ''

/**
 * Generate the daily in-app notifications and, when enabled and permitted, the system reminder.
 * Safe to call often: runs at most once per day per process, and each notification is deduped in kv.
 */
export async function runDailyChecks(force = false): Promise<void> {
  const today = todayKey()
  const hour = new Date().getHours()
  if (!force && ranFor === `${today}:${hour >= 18 ? 'pm' : 'am'}`) return
  ranFor = `${today}:${hour >= 18 ? 'pm' : 'am'}`

  const settings = await getSettings()
  const summary = await dueSummary()
  if (summary.due > 0) {
    await pushNotification({
      type: 'due',
      title: t('notif.dueTitle', { count: summary.due }),
      body: t('notif.dueBody', { count: summary.due, fresh: summary.fresh }),
      link: summary.perSet[0] ? `/set/${summary.perSet[0].setId}/srs` : '/library',
      dedupeKey: 'due',
    })
  }

  const streak = (await db.streak.get('streak')) ?? emptyStreak()
  if (hour >= 18 && isStreakAtRisk(streak, today)) {
    await pushNotification({
      type: 'streak',
      title: t('notif.streakTitle', { count: streak.current }),
      body: t('notif.streakBody'),
      link: '/',
      dedupeKey: 'streak',
    })
  }

  // System reminder: once per day after the chosen hour, only if nothing was studied yet today.
  if (settings.notifications.dailyReminder && hour >= settings.notifications.hour) {
    const sentRow = await db.kv.get('notif.lastReminder')
    if (sentRow?.value !== today && streak.lastDay !== today) {
      const title = summary.due > 0 ? t('notif.dueTitle', { count: summary.due }) : t('notif.reminderTitle')
      const body = summary.due > 0 ? t('notif.dueBody', { count: summary.due, fresh: summary.fresh }) : t('notif.reminderBody')
      const ok = await showSystemNotification(title, body, 'myquizz-daily')
      if (ok) await db.kv.put({ key: 'notif.lastReminder', value: today })
    }
  }
}
