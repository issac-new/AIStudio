// Observatory 数据面探针：监听 request/response + 页内直调 fetch 对照
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
const reqs = []
page.on('request', r => { const u = r.url(); if (u.includes('/api/hermes/kanban') || u.includes('/api/studio/sessions')) reqs.push('REQ ' + u.slice(0, 110)) })
page.on('response', r => { const u = r.url(); if (u.includes('/api/hermes/kanban') || u.includes('/api/studio/sessions')) reqs.push('  RES ' + r.status() + ' ' + u.slice(0, 95)) })
await page.goto('http://localhost:8651/#/app/board?tab=observatory', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.run-trace-overview', { timeout: 20000 })
await page.waitForTimeout(20000)
console.log(reqs.slice(0, 24).join('\n') || 'ZERO kanban/sessions requests')
const text = await page.evaluate(() => document.querySelector('.run-trace-overview')?.innerText?.slice(0, 130))
console.log('TEXT:', (text || '').replace(/\n/g, '|'))
// 页内直调对照（带同源凭证头）
const probe = await page.evaluate(async () => {
  const tok = localStorage.getItem('hermes_api_key') || ''
  const r = await fetch('/api/hermes/kanban/boards', { headers: { Authorization: 'Bearer ' + tok } })
  let body = ''
  try { body = (await r.json()).boards?.length + ' boards' } catch { body = 'non-json' }
  return `direct fetch: ${r.status} ${body} (token len ${tok.length})`
})
console.log(probe)
await browser.close()
