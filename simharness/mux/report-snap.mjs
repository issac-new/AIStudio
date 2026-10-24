import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:8899'
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1 })).newPage()
const outDir = '/tmp/report-snap'
const target = process.argv[2] || 'simulation-report.html'
const marks = (process.argv[3] || '').split(',').filter(Boolean)
await page.goto(`${BASE}/${target}?v=${Date.now()}`) // cache-bust
await page.waitForTimeout(1500)
console.log('title:', await page.title(), '| url:', page.url())
for (const sel of marks) {
  const el = page.locator(sel).first()
  if (await el.isVisible().catch(() => false)) {
    await el.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(1300) // 等懒加载图就位防版面漂移
    const name = sel.replace(/[^a-z0-9]+/gi, '_').slice(0, 40) + '_' + Date.now()
    await page.screenshot({ path: `${outDir}/${target.split('.')[0]}-${name}.png` })
    // 调试：当前视口内是否有 checked 灯箱图
    const lit = await page.evaluate(() => [...document.querySelectorAll('label.shot input:checked')].length)
    console.log('snap:', name, '| checked-lightbox:', lit)
  } else console.log('miss:', sel)
}
await browser.close()
