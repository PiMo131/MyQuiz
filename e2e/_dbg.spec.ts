import { test } from '@playwright/test'
import { openApp } from './helpers'
test('dbg editor', async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await openApp(page)
  await page.goto('/#/create')
  await page.getByRole('textbox', { name: 'Title' }).fill('Numbers')
  const row = page.getByRole('article', { name: 'Card 1' })
  await row.getByRole('textbox', { name: 'Term' }).fill('one')
  await page.waitForTimeout(300)
  console.log('TERM1 after fill:', JSON.stringify(await row.getByRole('textbox', { name: 'Term' }).inputValue().catch(() => 'n/a')), await row.getByRole('textbox', { name: 'Term' }).evaluate((e) => e.tagName + ' ce=' + (e as HTMLElement).isContentEditable + ' text=' + e.textContent))
  await page.getByRole('button', { name: 'Add a card' }).click()
  await page.waitForTimeout(500)
  console.log('articles:', await page.getByRole('article').count())
  console.log(await page.getByRole('main').ariaSnapshot())
  // import modal
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Paste text' }).fill('red\trood\ngreen\tgroen\nblue\tblauw')
  await page.waitForTimeout(800)
  console.log('DIALOG count', await dialog.count())
  console.log(await page.locator('body').ariaSnapshot())
})
