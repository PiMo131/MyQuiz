import { expect, test } from '@playwright/test'

test('shell renders home and navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('link', { name: /MyQuizz/ }).first()).toBeVisible()
  await page.goto('/#/library')
  await expect(page).toHaveURL(/#\/library/)
  expect(errors).toEqual([])
})

test('manifest and service worker are served', async ({ page, request }) => {
  const res = await request.get('/MyQuiz/manifest.webmanifest')
  expect(res.ok()).toBeTruthy()
  const json = await res.json()
  expect(json.name).toBe('MyQuizz')
  await page.goto('/')
  const sw = await request.get('/MyQuiz/sw.js')
  expect(sw.ok()).toBeTruthy()
})
