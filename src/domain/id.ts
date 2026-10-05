import { nanoid } from 'nanoid'
export const newId = (size = 12): string => nanoid(size)
export const now = (): number => Date.now()
export const todayKey = (d = new Date()): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
