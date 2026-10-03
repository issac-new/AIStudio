// 冒烟：登录落地 → 抓应用壳 → 枚举顶栏/侧栏可交互元素（为三大面走查提供落点）。
// 用法：node scripts/regression/walk-smoke.mjs
import { openBrowser, bootApp, clearMasks, Ledger, SHOTS } from './harness.mjs'

const { browser, page } = await openBrowser()
const led = new Ledger('smoke')
const consoleErrors = []
const failedReq = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
page.on('requestfailed', (r) => failedReq.push(`${r.url()} :: ${r.failure()?.errorText}`))
page.on('response', (r) => { if (r.status() >= 400) failedReq.push(`${r.status()} ${r.url()}`) })

try {
  await bootApp(page)
  // splash 可能仍在：最长再等 20s 等壳出现
  const shellSel = '.n-layout, .app-shell, [data-testid], header, nav'
  let shellReady = false
  for (let i = 0; i < 20; i++) {
    if (await page.locator(shellSel).first().count() > 0) { shellReady = true; break }
    await page.waitForTimeout(1000)
  }
  await clearMasks(page)
  led.record('应用壳渲染（含加载等待）', shellReady, `url=${page.url()} waited=${shellReady ? '≤20s' : '20s+'}`)
  await led.shot(page, 'app-shell')

  const nav = await page.evaluate(() => {
    const out = []
    for (const a of document.querySelectorAll('a,button,[role=button],[role=tab]')) {
      const t = (a.textContent || '').trim().replace(/\s+/g, ' ')
      if (!t || t.length > 24) continue
      const r = a.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) continue
      out.push({ tag: a.tagName, text: t, href: a.getAttribute('href') || '', testid: a.getAttribute('data-testid') || '', x: Math.round(r.x), y: Math.round(r.y) })
    }
    return out
  })
  console.log('NAV=' + JSON.stringify(nav, null, 1))
  led.record('壳层可交互元素枚举', nav.length > 10, `count=${nav.length}`)
  console.log('CONSOLE_ERRORS=' + JSON.stringify(consoleErrors.slice(0, 10), null, 1))
  console.log('FAILED_REQ=' + JSON.stringify(failedReq.slice(0, 15), null, 1))
} finally {
  led.flush()
  await browser.close()
}
