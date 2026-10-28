// Observatory 提速验收：全链走完耗时 + 拓扑渲染 + 截图
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
mkdirSync('/tmp/obs-accept', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
const t0 = Date.now()
await page.goto('http://localhost:8649/#/app/board?tab=observatory', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.run-trace-overview', { timeout: 60000 }).catch(() => {})
let done = false, lastState = ''
for (let i = 0; i < 60 && !done; i++) {
  await page.waitForTimeout(2000)
  const s = await page.evaluate(() => {
    const el = document.querySelector('.run-trace-overview')
    if (!el) return null
    const t = el.innerText
    return { loading: /Loading/i.test(t), canvas: !!document.querySelector('.run-trace-overview canvas, .run-trace-overview [data-run-trace-topology]') }
  }).catch(() => null)
  if (s) {
    lastState = JSON.stringify(s)
    done = !s.loading && s.canvas
  }
}
const elapsed = Math.round((Date.now() - t0) / 1000)
await page.screenshot({ path: '/tmp/obs-accept/observatory-perf.png' })
console.log(`done=${done} elapsed=${elapsed}s state=${lastState}`)
await browser.close()
process.exit(done ? 0 : 1)
