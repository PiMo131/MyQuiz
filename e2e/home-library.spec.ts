import { expect, test } from '@playwright/test'
import { DEMO_TITLE, assertNoErrors, collectErrors, noHorizontalScroll } from './helpers'

test('onboarding → library shows demo set → set page', async ({ page }) => {
  const log = collectErrors(page)
  await page.goto('/')
  const card = page.getByRole('region', { name: /make it yours/i })
  await expect(card).toBeVisible()
  await card.getByRole('textbox', { name: 'Name' }).fill('Pike')
  await card.getByRole('button', { name: 'Get started' }).click()
  await expect(card).toBeHidden()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Pike')

  await page.getByRole('navigation').getByRole('link', { name: 'Library' }).click()
  await expect(page).toHaveURL(/#\/library/)
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: DEMO_TITLE }).first().click()
  await expect(page).toHaveURL(/#\/set\/[^/]+$/)
  await expect(page.getByRole('heading', { level: 1, name: DEMO_TITLE })).toBeVisible()
  await expect(page.getByText('12 terms')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Terms in this set (12)' })).toBeVisible()
  // no raw i18n keys leaking
  await expect(page.locator('body')).not.toContainText(/\b(common|study|library|games|live|ai|editor|share):[a-zA-Z]+\./)
  assertNoErrors(log)
})

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('home, set page and a game have no horizontal scroll', async ({ page }) => {
    const log = collectErrors(page)
    await page.goto('/')
    await expect(page.getByRole('region', { name: /make it yours/i })).toBeVisible()
    await noHorizontalScroll(page, 390)
    await page.getByRole('button', { name: /^Skip$/ }).click()
    await noHorizontalScroll(page, 390)
    const link = page.getByRole('main').getByRole('link', { name: DEMO_TITLE }).first()
    const id = /#\/set\/([^/?]+)/.exec((await link.getAttribute('href')) ?? '')![1]
    await page.goto(`/#/set/${id}`)
    await expect(page.getByRole('heading', { level: 1, name: DEMO_TITLE })).toBeVisible()
    await noHorizontalScroll(page, 390)
    await page.goto(`/#/set/${id}/match`)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 10_000 })
    await noHorizontalScroll(page, 390)
    await page.goto(`/#/set/${id}/flashcards`)
    await page.getByRole('dialog').getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('button', { name: /Flashcard, press Space/ })).toBeVisible()
    await noHorizontalScroll(page, 390)
    assertNoErrors(log)
  })
})
