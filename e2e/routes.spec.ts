import { expect, test } from '@playwright/test'
import { assertNoErrors, collectErrors, openApp } from './helpers'

const RAW_KEY = /\b(common|study|library|games|live|ai|editor|share):[a-zA-Z]+(\.[a-zA-Z]+)+\b/

test('every registered route renders without errors or raw i18n keys', async ({ page }) => {
  test.setTimeout(120_000)
  const log = collectErrors(page)
  const id = await openApp(page)
  const routes = [
    '/', '/library', '/search', '/settings', '/achievements', '/stats', '/notifications', '/games', '/live', '/live/join', '/ai',
    '/ai/generate', '/ai/study-guide', '/ai/practice-test', '/import', '/create',
    `/set/${id}`, `/set/${id}/edit`, `/set/${id}/print`, `/set/${id}/spell`, `/set/${id}/listen`, `/set/${id}/flashcards`,
    `/set/${id}/learn`, `/set/${id}/write`, `/set/${id}/test`, `/set/${id}/srs`, `/set/${id}/match`, `/set/${id}/blocks`,
    `/set/${id}/blast`, `/set/${id}/charms`, `/set/${id}/hangman`, `/set/${id}/wordsearch`, `/set/${id}/speedreview`,
    `/live/host/${id}`, '/does-not-exist',
  ]
  for (const r of routes) {
    await page.goto(`/#${r}`)
    await expect(page.locator('main, [role=dialog]').first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(250)
    const text = await page.locator('body').innerText()
    expect(text, `raw i18n key on ${r}`).not.toMatch(RAW_KEY)
    expect(text.trim().length, `empty page on ${r}`).toBeGreaterThan(0)
    expect(log.errors, `errors after ${r}`).toEqual([])
  }
  await expect(page.getByText('Page not found')).toBeVisible()
  assertNoErrors(log)
})
