import { expect, test } from '@playwright/test'
import { assertNoErrors, collectErrors, openApp } from './helpers'

const DEMO_PAIRS: Array<[string, string]> = [
  ['Pomodoro technique', 'Studying in 25-minute blocks'],
  ['Active recall', 'Actively retrieving information'],
  ['Spaced repetition', 'Reviewing at increasing intervals'],
  ['Interleaving', 'Mixing different topics'],
  ['Feynman technique', 'Explaining a concept in simple words'],
  ['Elaboration', 'Connecting new knowledge'],
  ['Retrieval practice', 'Practising recall'],
  ['Dual coding', 'Combining words with images'],
  ['Metacognition', 'Thinking about your own learning'],
  ['Sleep', 'Memories consolidate during sleep'],
  ['Testing effect', 'Testing yourself strengthens memory'],
  ['Cognitive load', 'The amount of mental effort'],
]

test('match: start and match a correct pair', async ({ page }) => {
  const log = collectErrors(page)
  const id = await openApp(page)
  await page.goto(`/#/set/${id}/match`)
  await expect(page.getByRole('heading', { name: /Play a game of Match/ })).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const grid = page.getByRole('grid')
  await expect(grid).toBeVisible({ timeout: 10_000 })
  const tiles = grid.getByRole('gridcell')
  await expect(tiles).toHaveCount(12)
  // The board shows a random subset of pairs; pick whichever demo pair is on it.
  const texts = await tiles.allInnerTexts()
  const pair = DEMO_PAIRS.find(([t, d]) => texts.some((x) => x.includes(t)) && texts.some((x) => x.includes(d)))
  expect(pair, 'a known term/definition pair is on the board').toBeTruthy()
  const term = tiles.filter({ hasText: pair![0] })
  const def = tiles.filter({ hasText: pair![1] })
  await term.click()
  await def.click()
  // matched tiles disappear / are marked; both should no longer be selectable
  await expect.poll(async () => {
    const t = await term.count()
    const d = await def.count()
    if (t === 0 && d === 0) return 'gone'
    const a = (await term.getAttribute('aria-disabled')) ?? (await term.getAttribute('data-state')) ?? ''
    const b = (await def.getAttribute('aria-disabled')) ?? (await def.getAttribute('data-state')) ?? ''
    return `${a}|${b}`
  }, { timeout: 5000 }).toMatch(/gone|true|matched/)
  assertNoErrors(log)
})

for (const game of ['blocks', 'blast', 'charms', 'hangman', 'wordsearch', 'speedreview']) {
  test(`${game}: intro renders and Play starts the game`, async ({ page }) => {
    const log = collectErrors(page)
    const id = await openApp(page)
    await page.goto(`/#/set/${id}/${game}`)
    const play = page.getByRole('button', { name: 'Play', exact: true })
    await expect(play).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Play a game of/)
    await play.click()
    await expect(play).toBeHidden({ timeout: 10_000 })
    await page.waitForTimeout(1500)
    await expect(page.getByRole('main')).toBeVisible()
    assertNoErrors(log)
  })
}
