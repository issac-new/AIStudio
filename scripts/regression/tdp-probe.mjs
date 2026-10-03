import { openBrowser, bootApp, clearMasks } from './harness.mjs'
const { browser, page } = await openBrowser()
await bootApp(page)
await clearMasks(page)
const info = await page.evaluate(() => {
  const tdp = [...document.querySelectorAll('[data-testid^=tdp-]')].map(e => e.getAttribute('data-testid'))
  const rows = [...document.querySelectorAll('[class*=tdp__item], [class*=att-task]')].slice(0, 4).map(e => ({ cls: String(e.className).slice(0, 30), testids: [...e.querySelectorAll('[data-testid]')].map(x => x.getAttribute('data-testid')), text: e.innerText.replace(/\s+/g, ' ').slice(0, 60) }))
  return { allTdpTestids: [...new Set(tdp)].slice(0, 30), rows }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
