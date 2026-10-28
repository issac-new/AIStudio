// 耗时分解：各类 API 请求计数/时间线（定位剩余串行瓶颈）
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
const t0 = Date.now()
const cats = {}
function cat(u) {
  if (u.includes('/kanban?') || u.includes('/kanban/')) return 'kanban'
  if (u.includes('/sessions')) return 'sessions'
  if (u.includes('/trace') || u.includes('/l2')) return 'trace'
  return 'other'
}
page.on('request', r => { const c = cat(r.url()); cats[c] = (cats[c] || 0) + 1 })
page.on('requestfinished', r => { const c = cat(r.url()) + '_fin'; cats[c] = (cats[c] || 0) + 1 })
await page.goto('http://localhost:8649/#/app/board?tab=observatory', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.run-trace-overview', { timeout: 60000 }).catch(() => {})
for (let i = 1; i <= 30; i++) {
  await page.waitForTimeout(5000)
  const st = await page.evaluate(() => {
    const t = document.querySelector('.run-trace-overview')?.innerText || ''
    return { loading: /Loading/i.test(t), svg: document.querySelectorAll('.run-trace-overview svg *').length }
  }).catch(() => ({ loading: true, svg: 0 }))
  console.log(`t=${i * 5}s`, JSON.stringify(st), JSON.stringify(cats))
  if (!st.loading && st.svg > 8) break
}
console.log('TOTAL', Math.round((Date.now() - t0) / 1000) + 's')
await browser.close()
