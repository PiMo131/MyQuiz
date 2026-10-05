import { expect, test, type Page } from '@playwright/test'
import { assertNoErrors, collectErrors, createSetViaEditor, openApp } from './helpers'

const CARDS: Array<[string, string]> = [['one', 'een'], ['two', 'twee'], ['three', 'drie'], ['four', 'vier']]

async function smallSet(page: Page) {
  await openApp(page)
  return createSetViaEditor(page, 'Numbers', CARDS)
}

test('flashcards: flip with Space, next with →, sorting mode to summary', async ({ page }) => {
  const log = collectErrors(page)
  const id = await smallSet(page)
  await page.goto(`/#/set/${id}/flashcards`)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Choose card sorting')).toBeVisible()
  await dialog.getByRole('button', { name: /^Browsing/ }).click()
  await dialog.getByRole('button', { name: 'Start' }).click()
  const card = page.getByRole('button', { name: /Flashcard, press Space/ })
  await expect(card).toBeVisible()
  await expect(card).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('1 / 4').first()).toBeVisible()
  await page.keyboard.press('Space')
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('2 / 4').first()).toBeVisible()
  await expect(card).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('1 / 4').first()).toBeVisible()
  // Clicking the card focuses it; Space must then flip exactly once (not twice).
  await card.click()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Space')
  await expect(card).toHaveAttribute('aria-pressed', 'false')

  // Switch to basic sorting
  await page.getByRole('banner').getByRole('button', { name: 'Options' }).click()
  await page.getByRole('button', { name: /Basic sorting/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Start' }).click()
  const know = page.getByRole('button', { name: 'Know', exact: true })
  const learning = page.getByRole('button', { name: 'Still learning', exact: true })
  await expect(know).toBeVisible()
  await learning.click()
  await know.click()
  await know.click()
  await know.click()
  await expect(page.getByRole('heading', { name: /Round 1 done/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue with 1 still learning/ })).toBeVisible()
  assertNoErrors(log)
})

test('learn: answer a multiple-choice question and continue', async ({ page }) => {
  const log = collectErrors(page)
  const id = await smallSet(page)
  await page.goto(`/#/set/${id}/learn`)
  await page.getByRole('button', { name: 'Start Learn' }).click()
  await expect(page.getByText('Choose an answer')).toBeVisible()
  const first = page.getByRole('button', { name: /^1 / })
  const text = ((await first.textContent()) ?? '').replace(/^1\s*/, '').trim()
  await first.click()
  // Feedback: either correct or still-learning; the remaining options are disabled.
  await expect(page.getByText(/Correct!|No sweat/)).toBeVisible()
  expect(text.length).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Choose an answer|Type the answer/)).toBeVisible()
  assertNoErrors(log)
})

test('write: type an answer and submit', async ({ page }) => {
  const log = collectErrors(page)
  const id = await smallSet(page)
  await page.goto(`/#/set/${id}/write`)
  const input = page.getByRole('textbox', { name: 'Type the answer' })
  await expect(input).toBeVisible()
  await expect(page.getByText('Remaining')).toBeVisible()
  const prompt = (await page.getByRole('main').locator('h1, h2, p, div').filter({ hasText: /^(one|two|three|four)$/ }).first().textContent()) ?? ''
  const answer = Object.fromEntries(CARDS)[prompt.trim()] ?? 'x'
  await input.fill(answer)
  await page.getByRole('button', { name: 'Answer' }).click()
  await expect(page.getByText(/Correct!|Study this one!/)).toBeVisible()
  assertNoErrors(log)
})

test('test: multiple choice only, answer all, submit, see score', async ({ page }) => {
  const log = collectErrors(page)
  const id = await smallSet(page)
  await page.goto(`/#/set/${id}/test`)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Set up your test')).toBeVisible()
  for (const name of ['True/False', 'Matching', 'Written']) {
    const sw = dialog.getByRole('switch', { name })
    if ((await sw.getAttribute('aria-checked')) === 'true') await sw.click()
  }
  await expect(dialog.getByRole('switch', { name: 'Multiple choice' })).toHaveAttribute('aria-checked', 'true')
  await dialog.getByRole('button', { name: 'Start test' }).click()
  await expect(dialog).toBeHidden()
  const prompts = page.getByText('Choose an answer')
  const n = await prompts.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    // pick the first option of each question (the option grid directly follows the "Choose an answer" hint)
    await prompts.nth(i).locator('xpath=following-sibling::div[1]').getByRole('button').first().click()
  }
  await expect(page.getByText(/All done! Ready to submit/)).toBeVisible()
  await page.getByRole('button', { name: 'Submit test' }).click()
  await expect(page.getByText(new RegExp(`\\d+ of ${n} correct`))).toBeVisible()
  assertNoErrors(log)
})

test('srs: daily plan → flip → rate Okay → next card', async ({ page }) => {
  const log = collectErrors(page)
  const id = await smallSet(page)
  await page.goto(`/#/set/${id}/srs`)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Today’s spaced repetition plan')).toBeVisible()
  await expect(dialog.getByText('New cards')).toBeVisible()
  await dialog.getByRole('button', { name: 'Start' }).click()
  const card = page.getByRole('button', { name: /Flashcard, press Space/ })
  await expect(card).toBeVisible()
  const firstTerm = await card.textContent()
  await page.getByRole('button', { name: /^Flip/ }).click()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^Okay/ }).click()
  await expect(card).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => card.textContent()).not.toBe(firstTerm)
  assertNoErrors(log)
})
