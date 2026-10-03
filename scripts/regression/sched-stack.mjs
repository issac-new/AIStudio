import { openBrowser, bootApp, clearMasks } from './harness.mjs'
const { browser, page } = await openBrowser()
await bootApp(page)
await clearMasks(page)
await page.locator('[data-testid=ia-header-schedule]').click()
await page.waitForTimeout(1500)
const info = await page.evaluate(() => {
  const top = document.elementFromPoint(780, 470)
  const chain = []
  for (let el = top, i = 0; el && i < 8; i++, el = el.parentElement) {
    const cs = getComputedStyle(el)
    chain.push({ tag: el.tagName, cls: String(el.className).slice(0, 36), z: cs.zIndex, pos: cs.position, tr: cs.transform !== 'none', op: cs.opacity })
  }
  const sched = [...document.querySelectorAll('[class*=cockpit-schedule]')].map(e => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    return { cls: String(e.className).slice(0, 40), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], z: cs.zIndex, pos: cs.position, disp: cs.display, vis: cs.visibility, op: cs.opacity }
  })
  return { topAtCenter: chain, sched }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
