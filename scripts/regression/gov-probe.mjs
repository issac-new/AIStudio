import { openBrowser, bootApp, clearMasks } from './harness.mjs'
const { browser, page } = await openBrowser()
const errs = []
page.on('pageerror', e => errs.push(String(e).slice(0, 150)))
await bootApp(page)
await clearMasks(page)
const before = await page.evaluate(() => location.hash)
await page.evaluate(() => document.querySelector('[data-testid=flow-gov]').click())
await page.waitForTimeout(1800)
const info = await page.evaluate(() => ({
  hash: location.hash,
  govOverlay: !!document.querySelector('[data-testid=gov-overlay]'),
  govBack: !!document.querySelector('[data-testid=gov-back]'),
  govNav: [...document.querySelectorAll('[data-testid^=gov-nav-]')].map(e => e.textContent.trim()),
  hasBoardTabs: document.body.innerText.includes('追溯矩阵'),
}))
console.log('before=', before, 'GOV=', JSON.stringify(info), 'errors=', JSON.stringify(errs))
await page.screenshot({ path: '/tmp/regression-shots/gov-probe.png' })
await browser.close()
