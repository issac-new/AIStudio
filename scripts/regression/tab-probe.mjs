import { openBrowser, bootApp, clearMasks } from './harness.mjs'
const { browser, page } = await openBrowser()
await page.goto('http://localhost:8689/#/app/board', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
const later = page.locator('button', { hasText: '稍后提醒' }).first()
if (await later.count()) await later.click({ force: true }).catch(() => {})
for (const t of ['全链路追踪', '台账与规则', '审计与变更', '文档评审']) {
  await page.evaluate((label) => { [...document.querySelectorAll('button, [role=tab]')].find(e => (e.textContent||'').trim() === label && e.offsetParent !== null)?.click() }, t)
  await page.waitForTimeout(2500)
  const txt = await page.evaluate(() => {
    const clone = document.body.cloneNode(true)
    for (const el of clone.querySelectorAll('.studio-navigation-rail, .ia-header, .ia-attn-bar, header, nav, aside')) el.remove()
    return (clone.innerText || '').replace(/\s+/g, ' ').slice(0, 260)
  })
  console.log(`== ${t}: ${txt}`)
}
await browser.close()
