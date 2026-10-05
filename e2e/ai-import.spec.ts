import { expect, test, type Page } from '@playwright/test'
import { assertNoErrors, collectErrors, openApp } from './helpers'

/** Chatbot-style answer: prose + fenced myquizz-set JSON without any ids. */
const AI_ANSWER = [
  'Here is your set:',
  '```json',
  JSON.stringify(
    {
      format: 'myquizz-set',
      version: 1,
      set: { title: 'Cell biology (AI)', description: 'From notes.pdf', tags: ['bio'], lang: { term: 'en', definition: 'en' }, cardTypes: ['basic'], author: 'AI (test)' },
      cards: [
        { term: 'Mitochondrion', definition: 'Produces ATP', hint: 'Powerhouse', distractors: ['Ribosome', 'Nucleus', 'Golgi'] },
        { term: 'Ribosome', definition: 'Builds proteins', hint: 'Translation', distractors: ['Mitochondrion', 'Nucleus', 'Lysosome'] },
      ],
    },
    null,
    2,
  ),
  '```',
  'Let me know if you want more cards!',
].join('\n')

async function previewAnswer(page: Page, answer: string) {
  await page.goto('/#/import/ai')
  await expect(page.getByRole('heading', { level: 1, name: 'Import with your own AI' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Chatbot answer' }).fill(answer)
  await page.getByRole('button', { name: 'Preview import' }).click()
  await page.waitForURL(/#\/import$/)
  await expect(page.getByRole('heading', { name: 'Import set' })).toBeVisible()
  await expect(page.getByText('Preview')).toBeVisible()
}

async function importFromPreview(page: Page): Promise<string> {
  await page.getByRole('button', { name: /^(Import|Import as copy)$/ }).first().click()
  await page.waitForURL(/#\/set\/[^/]+$/)
  return /#\/set\/([^/?]+)/.exec(page.url())![1]
}

test('/#/import/ai shows the 4 steps and the prompt can be copied or read', async ({ page }) => {
  const log = collectErrors(page)
  await openApp(page)
  await page.goto('/#/import/ai')
  await expect(page.getByRole('heading', { level: 1, name: 'Import with your own AI' })).toBeVisible()
  for (const n of [1, 2, 3, 4]) await expect(page.getByText(`Step ${n}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download .md' })).toHaveAttribute('href', /ai\/myquizz-import-skill\.md$/)
  await expect(page.getByRole('link', { name: /ChatGPT/ })).toHaveAttribute('target', '_blank')

  await page.getByRole('button', { name: 'Copy prompt' }).click()
  // Clipboard access may be denied in headless runs: then the prompt text is shown for manual copying.
  const toast = page.getByText('Prompt copied. Paste it into your chatbot.')
  const pre = page.getByLabel('Prompt text')
  await expect(toast.or(pre)).toBeVisible()

  await page.getByRole('button', { name: 'Show prompt text' }).click().catch(() => {})
  await expect(pre).toBeVisible()
  await expect(pre).toContainText('"format": "myquizz-set"')
  assertNoErrors(log)
})

test('fenced JSON from a chatbot → preview → import, twice, without clobbering the first set', async ({ page }) => {
  const log = collectErrors(page)
  await openApp(page)

  await previewAnswer(page, AI_ANSWER)
  await expect(page.getByText('2 cards')).toBeVisible()
  await expect(page.getByText('Mitochondrion')).toBeVisible()
  await expect(page.getByText('Ribosome')).toBeVisible()
  await expect(page.getByText(/You already have this set/)).toHaveCount(0)
  const first = await importFromPreview(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Cell biology (AI)' })).toBeVisible()
  await expect(page.getByText('2 terms')).toBeVisible()

  // Same answer again: a second, independent set
  await previewAnswer(page, AI_ANSWER)
  await expect(page.getByText(/You already have this set/)).toHaveCount(0)
  const second = await importFromPreview(page)
  expect(second).not.toBe(first)
  await expect(page.getByText('2 terms')).toBeVisible()

  // The first set still has both cards
  await page.goto(`/#/set/${first}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Cell biology (AI)' })).toBeVisible()
  await expect(page.getByText('2 terms')).toBeVisible()
  await expect(page.getByText('Mitochondrion').first()).toBeVisible()
  await expect(page.getByText('Ribosome').first()).toBeVisible()

  await page.goto('/#/library')
  await expect(page.getByRole('main').getByRole('heading', { level: 3, name: 'Cell biology (AI)' })).toHaveCount(2)
  assertNoErrors(log)
})

test('TSV lines from a chatbot preview as cards; garbage shows an error', async ({ page }) => {
  const log = collectErrors(page)
  await openApp(page)
  await page.goto('/#/import/ai')
  const box = page.getByRole('textbox', { name: 'Chatbot answer' })
  await box.fill('this is not a set at all')
  await page.getByRole('button', { name: 'Preview import' }).click()
  await expect(page.getByRole('alert')).toContainText('No cards found')
  await expect(page.getByText('Tip: paste only the JSON block, or the TSV lines.')).toBeVisible()

  await previewAnswer(page, 'hond\tdog\tbarks\nkat\tcat\npaard\thorse')
  await expect(page.getByText('3 cards')).toBeVisible()
  await expect(page.getByText('hond')).toBeVisible()
  await expect(page.getByText('horse')).toBeVisible()
  assertNoErrors(log)
})

test('/#/import textarea accepts pasted chatbot JSON directly', async ({ page }) => {
  const log = collectErrors(page)
  await openApp(page)
  await page.goto('/#/import')
  await page.getByRole('textbox', { name: 'Link, code or text' }).fill(AI_ANSWER)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.getByText('2 cards')).toBeVisible()
  await expect(page.getByText('Mitochondrion')).toBeVisible()
  assertNoErrors(log)
})
