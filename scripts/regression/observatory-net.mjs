// Observatory 网络级探针：统计 getTask 批量请求的发出/完成/失败
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
let reqN = 0, finN = 0, failN = 0, err4xx = 0, err5xx = 0
const slow = []
page.on('request', r => { if (r.url().includes('/tasks?') || r.url().includes('/tasks/')) reqN++ })
page.on('requestfinished', r => { if (r.url().includes('/tasks')) { finN++; const d = r.timing()?.responseStart; if (d && d > 4000) slow.push(Math.round(d)) } })
page.on('requestfailed', r => { if (r.url().includes('/tasks')) failN++ })
page.on('response', r => { const u = r.url(); if (u.includes('/tasks')) { if (r.status() >= 500) err5xx++; else if (r.status() >= 400) err4xx++ } })
await page.goto('http://localhost:8649/#/app/board?tab=observatory', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.run-trace-overview', { timeout: 60000 }).catch(() => {})
for (let i = 1; i <= 12; i++) {
  await page.waitForTimeout(5000)
  console.log(`t=${i * 5}s req=${reqN} fin=${finN} fail=${failN} 4xx=${err4xx} 5xx=${err5xx}`)
  if (i === 12) {
    const st = await page.evaluate(() => {
      const t = document.querySelector('.run-trace-overview')?.innerText || ''
      return { loading: /Loading/i.test(t), pct: (t.match(/(\d+)%/) || [])[1] }
    })
    console.log('state:', JSON.stringify(st), 'slowReq(>4s):', slow.length, 'maxMs:', Math.max(0, ...slow))
  }
}
await page.screenshot({ path: '/tmp/obs-accept/net-probe.png' })
await browser.close()
