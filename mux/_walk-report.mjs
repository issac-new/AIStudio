// _walk-report.mjs — 统一报告浏览器渲染走查（演示可用性终验）
import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 100)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 100)) })
const url = 'file:///Volumes/nvme2230/lab/ncwk-sim-mux/runs/20260929-v5-run4/evidence/unified-roadshow-report.html'
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(2500)
const probe = await page.evaluate(() => {
  const h = document.body.innerText
  const imgs = [...document.images]
  return {
    title: document.title.slice(0, 60),
    headings: [...document.querySelectorAll('h2')].map(e => e.innerText.slice(0, 30)),
    imgTotal: imgs.length,
    imgBroken: imgs.filter(i => !i.complete || i.naturalWidth === 0).length,
    hasJourney: h.includes('推演实录') && h.includes('26'),
    scrollH: document.body.scrollHeight,
  }
})
console.log(JSON.stringify(probe, null, 1))
console.log('js errors:', errors.length ? errors.slice(0, 5) : '无')
await page.screenshot({ path: '/tmp/unified-top.png' })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.45))
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/unified-mid.png' })
await browser.close()
