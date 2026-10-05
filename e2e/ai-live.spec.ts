import { expect, test } from '@playwright/test'
import { assertNoErrors, collectErrors, openApp } from './helpers'

test('ai hub shows the Basic provider; generate makes a 2-card set', async ({ page }) => {
  const log = collectErrors(page)
  await openApp(page)
  await page.goto('/#/ai')
  await expect(page.getByRole('heading', { level: 1, name: 'AI tools' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Which AI answers right now/ }).first()).toHaveText(/Basic/)

  await page.goto('/#/ai/generate')
  await page.getByRole('textbox', { name: 'Paste text' }).fill('Hond: dog\nKat: cat')
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.getByRole('heading', { name: 'Preview (2)' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('textbox', { name: 'Term' }).nth(0)).toHaveValue('Hond')
  await expect(page.getByRole('textbox', { name: 'Definition' }).nth(1)).toHaveValue('cat')
  await page.getByRole('textbox', { name: 'Set title' }).fill('Dieren')
  await page.getByRole('button', { name: 'Create set' }).click()
  await page.waitForURL(/#\/set\/[^/]+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Dieren' })).toBeVisible()
  await expect(page.getByText('2 terms')).toBeVisible()
  assertNoErrors(log)
})

test('live: home renders; host shows type picker and a lobby code', async ({ page }) => {
  const log = collectErrors(page)
  const id = await openApp(page)
  await page.goto('/#/live')
  await expect(page.getByRole('heading', { level: 1, name: /Play together/ })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Room code' })).toBeVisible()
  await page.goto(`/#/live/host/${id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Choose your game type' })).toBeVisible()
  await page.getByRole('button', { name: /^Classic Live/ }).click()
  await expect(page.getByText(/\b[A-Z0-9]{3}-[A-Z0-9]{3}\b/).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Copy invite link' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start game' })).toBeDisabled()
  // the connection may fail offline; the UI must stay up without page errors
  await page.waitForTimeout(2000)
  await expect(page.getByRole('heading', { name: /Waiting for players/ })).toBeVisible()
  assertNoErrors(log)
})
