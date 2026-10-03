import { openBrowser, bootApp } from './harness.mjs'
const { browser, page } = await openBrowser()
await bootApp(page)
await page.evaluate(() => {
  document.body.innerHTML = ''
  document.documentElement.style.background = 'rgb(0,255,0)'
  document.body.style.background = 'rgb(0,255,0)'
})
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/regression-shots/pixel-green.png' })
console.log('done — green if realtime')
await browser.close()
