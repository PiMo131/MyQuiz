import { CalendarPlus, Download, ExternalLink } from 'lucide-react'
import i18n from '@/app/i18n'
import { Button, Dropdown, type ButtonProps, type MenuItem } from '@/ui'
import { APP_NAME } from '@/domain/types'
import { googleCalendarUrl, outlookCalendarUrl, studyEvent, toIcs } from '@/domain/import-export/calendar'
import { fileNameFor } from '@/domain/import-export/exporters'
import { downloadText } from '@/domain/import-export/files'

function setLink(setId: string): string {
  return `${location.origin}${location.pathname}#/set/${setId}`
}

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Menu items for "Add to calendar": Google Calendar, Outlook and an .ics download. */
export function CalendarMenuItems(setId: string, title: string): MenuItem[] {
  const t = i18n.getFixedT(null, 'share')
  const ev = () => {
    const e = studyEvent(title, setLink(setId), new Date(), APP_NAME)
    e.title = t('calendar.eventTitle', { title, app: APP_NAME })
    return e
  }
  return [
    { label: t('calendar.google'), icon: <ExternalLink size={16} />, onSelect: () => openExternal(googleCalendarUrl(ev())) },
    { label: t('calendar.outlook'), icon: <ExternalLink size={16} />, onSelect: () => openExternal(outlookCalendarUrl(ev())) },
    { label: t('calendar.ics'), icon: <Download size={16} />, onSelect: () => downloadText(toIcs(ev()), fileNameFor(title, 'ics'), 'text/calendar;charset=utf-8') },
  ]
}

export function AddToCalendarButton({ setId, title, variant = 'outline', size = 'md' }: { setId: string; title: string; variant?: ButtonProps['variant']; size?: ButtonProps['size'] }) {
  const t = i18n.getFixedT(null, 'share')
  return (
    <Dropdown
      align="left"
      trigger={
        <Button variant={variant} size={size} leftIcon={<CalendarPlus size={16} />}>
          {t('calendar.button')}
        </Button>
      }
      items={CalendarMenuItems(setId, title)}
    />
  )
}
