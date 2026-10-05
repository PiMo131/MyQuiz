import { expect, type Page } from '@playwright/test'

export const DEMO_TITLE = 'Effective study strategies'

/** Console/page errors that are environment noise, not app bugs. */
const IGNORED = [
  /ResizeObserver loop/i,
  /wss:\/\//i, // trystero signalling relays (blocked offline / behind proxy)
  /WebSocket/i,
  /fonts\.googleapis|fonts\.gstatic/i,
  /ERR_CERT_AUTHORITY_INVALID|ERR_FAILED|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/i,
  /Failed to load resource/i, // external (fonts/relays) resources; app assets are same-origin and covered by pageerror
]

export interface ErrorLog { errors: string[] }

/** Collects uncaught exceptions and console errors; call `assertNoErrors` at the end of the test. */
export function collectErrors(page: Page): ErrorLog {
  const log: ErrorLog = { errors: [] }
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = `${m.text()} @ ${m.location().url}`
    if (IGNORED.some((re) => re.test(text))) return
    log.errors.push(`console: ${text}`)
  })
  return log
}

export function assertNoErrors(log: ErrorLog) {
  expect(log.errors, 'no page/console errors').toEqual([])
}

/** First visit: dismiss onboarding and return the demo set id. */
export async function openApp(page: Page): Promise<string> {
  await page.goto('/')
  const skip = page.getByRole('button', { name: /^Skip$/ })
  if (await skip.isVisible({ timeout: 5000 }).catch(() => false)) await skip.click()
  const link = page.getByRole('link', { name: DEMO_TITLE }).first()
  await expect(link).toBeVisible()
  const href = (await link.getAttribute('href')) ?? ''
  const id = /#\/set\/([^/?]+)/.exec(href)?.[1]
  if (!id) throw new Error(`no set id in ${href}`)
  return id
}

export async function createSetViaEditor(page: Page, title: string, cards: Array<[string, string]>): Promise<string> {
  await page.goto('/#/create')
  await page.getByRole('textbox', { name: 'Title' }).fill(title)
  for (let i = 0; i < cards.length; i++) {
    const n = i + 1
    if ((await page.getByRole('article', { name: `Card ${n}` }).count()) === 0) {
      await page.getByRole('button', { name: 'Add a card' }).click()
    }
    const row = page.getByRole('article', { name: `Card ${n}` })
    await row.getByRole('textbox', { name: 'Term' }).fill(cards[i][0])
    await row.getByRole('textbox', { name: 'Definition' }).fill(cards[i][1])
  }
  await page.getByRole('button', { name: 'Create', exact: true }).last().click()
  await page.waitForURL(/#\/set\/[^/]+$/)
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  return /#\/set\/([^/?]+)/.exec(page.url())![1]
}

export async function noHorizontalScroll(page: Page, width: number) {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(sw, 'no horizontal scroll').toBeLessThanOrEqual(width)
}
