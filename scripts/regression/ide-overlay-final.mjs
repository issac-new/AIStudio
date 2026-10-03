import { openBrowser } from './harness.mjs'
const { browser, page } = await openBrowser()
const ws = []
page.on('websocket', (w) => { ws.push(w.url().slice(0, 60)); w.on('framereceived', (f) => { const s = String(f.payload || '').slice(0, 120); if (/gov|decision|人工|open/i.test(s)) console.log('WS↓', s) }) })
await page.goto('http://localhost:8689/#/ide', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
const later = page.locator('button', { hasText: '稍后提醒' }).first()
const cnt = await later.count()
if (cnt) await later.click({ force: true }).catch(() => {})
console.log('dialogBtnCount=', cnt)
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(1000)
  const info = await page.evaluate(() => ({
    t: new Date().toISOString().slice(17, 23),
    gov: document.querySelectorAll('[data-testid=gov-overlay]').length,
    has856: /任务[^<]{0,4}856/.test(document.body.innerHTML),
  }))
  console.log(JSON.stringify(info), 'ws=', JSON.stringify(ws.slice(-2)))
  if (info.gov > 0 || info.has856) {
    const dump = await page.evaluate(() => {
      const el = document.querySelector('[data-testid=gov-overlay]') || [...document.querySelectorAll('div')].find(d => /任务[^<]{0,4}856/.test(d.innerHTML) && d.getBoundingClientRect().width > 800)
      return el ? { cls: String(el.className).slice(0, 60), tid: el.getAttribute('data-testid'), html: el.outerHTML.slice(0, 300) } : null
    })
    console.log('LIVE DUMP=', JSON.stringify(dump, null, 1))
    await page.screenshot({ path: '/tmp/regression-shots/overlay-caught.png' })
    break
  }
}
await browser.close()
