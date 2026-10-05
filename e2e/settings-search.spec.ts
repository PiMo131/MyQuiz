import { expect, test } from '@playwright/test'
import { assertNoErrors, collectErrors, openApp } from './helpers'

test('settings: language, dark mode, backup export, delete-all confirmation', async ({ page }) => {
  const log = collectErrors(page)
  await openApp(page)
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

  await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Light' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()])
  expect(download.suggestedFilename()).toMatch(/\.(zip|mqz|json)$/)

  await page.getByRole('button', { name: 'Wipe everything' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Delete all data')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Delete permanently' })).toBeDisabled()
  await dialog.getByRole('textbox').fill('DELETE')
  await expect(dialog.getByRole('button', { name: 'Delete permanently' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'Nederlands' }).click()
  await expect(page.getByRole('navigation').first().getByRole('link', { name: 'Bibliotheek' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl')
  await page.reload()
  await expect(page.getByRole('navigation').first().getByRole('link', { name: 'Bibliotheek' })).toBeVisible()
  assertNoErrors(log)
})

test('search: query from the demo set shows a result', async ({ page }) => {
  const log = collectErrors(page)
  await openApp(page)
  await page.goto('/#/search?q=Pomodoro')
  await expect(page.getByRole('heading', { name: /Results for “Pomodoro”/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Cards' }).getByRole('link', { name: /Pomodoro technique/ })).toBeVisible()
  await page.getByRole('region', { name: 'Cards' }).getByRole('link', { name: /Pomodoro technique/ }).click()
  await expect(page).toHaveURL(/#\/set\//)
  assertNoErrors(log)
})
