import { openBrowser, bootApp, clearMasks, BASE } from './harness.mjs'
const { browser, page } = await openBrowser()
const errs = []
page.on('pageerror', e => errs.push(String(e).slice(0, 120)))
await bootApp(page)
await clearMasks(page)
await page.evaluate(() => { location.hash = '#/hermes/connections' })
await page.waitForTimeout(5000)
const info = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.n-tabs-tab, [role=tab]')].map(e => e.textContent.trim())
  const main = document.querySelector('.ia-lshell__content, .app-main')
  return { hash: location.hash, tabs, text: (main?.innerText || document.body.innerText).slice(0, 220).replace(/\s+/g, ' ') }
})
console.log(JSON.stringify(info, null, 1), 'errors=', JSON.stringify(errs))
await page.screenshot({ path: '/tmp/regression-shots/conn-verify.png' })
await browser.close()
