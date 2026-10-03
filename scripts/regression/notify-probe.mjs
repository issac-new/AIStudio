import { openBrowser, bootApp, clearMasks } from './harness.mjs'
const { browser, page } = await openBrowser()
const errs = []
page.on('pageerror', e => errs.push(String(e).slice(0, 150)))
await bootApp(page)
await clearMasks(page)
await page.locator('[data-testid=ia-header-notify]').click()
await page.waitForTimeout(1500)
const info = await page.evaluate(() => {
  const el = document.querySelector('[data-testid=notify-dropdown]')
  if (!el) return { present: false }
  const r = el.getBoundingClientRect()
  return { present: true, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, text: el.innerText.slice(0, 150), vis: getComputedStyle(el).display + '/' + getComputedStyle(el).visibility + '/' + getComputedStyle(el).opacity }
})
console.log('NOTIFY=', JSON.stringify(info), 'errors=', JSON.stringify(errs))
await page.screenshot({ path: '/tmp/regression-shots/notify-probe.png' })
await browser.close()
