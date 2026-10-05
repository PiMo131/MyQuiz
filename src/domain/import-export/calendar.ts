/** Calendar helpers: Google Calendar URL and .ics content for a study reminder. Pure functions. */

export interface CalendarEvent {
  title: string
  description: string
  url: string
  start: Date
  end: Date
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** UTC timestamp in the compact iCalendar format: 20261006T151500Z */
export function icsStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

/** Tomorrow at the same time (rounded to the next quarter), 15-minute slot. */
export function studySlot(now = new Date(), minutes = 15): { start: Date; end: Date } {
  const start = new Date(now)
  start.setDate(start.getDate() + 1)
  start.setSeconds(0, 0)
  const q = Math.ceil(start.getMinutes() / 15) * 15
  start.setMinutes(q)
  const end = new Date(start.getTime() + minutes * 60_000)
  return { start, end }
}

export function studyEvent(setTitle: string, link: string, now = new Date(), appName = 'MyQuizz'): CalendarEvent {
  const { start, end } = studySlot(now)
  return {
    title: `Study ${setTitle} on ${appName}`,
    description: `${appName}: ${setTitle}\n${link}`,
    url: link,
    start,
    end,
  }
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${icsStamp(ev.start)}/${icsStamp(ev.end)}`,
    details: ev.description,
    location: ev.url,
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function outlookCalendarUrl(ev: CalendarEvent): string {
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: ev.title,
    startdt: ev.start.toISOString(),
    enddt: ev.end.toISOString(),
    body: ev.description,
    location: ev.url,
  })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fold lines at 75 octets as per RFC 5545. */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) {
      out.push(cur)
      cur = ' ' + ch
    } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n')
}

export function toIcs(ev: CalendarEvent, uid = `${Date.now()}@myquizz`): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MyQuizz//Study reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(ev.start)}`,
    `DTEND:${icsStamp(ev.end)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    `DESCRIPTION:${icsEscape(ev.description)}`,
    `URL:${ev.url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(ev.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
