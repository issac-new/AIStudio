// Observatory 端到端验收：加载走完 + 拓扑/时间线实际渲染 + 截图留证
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
mkdirSync('/tmp/obs-accept', { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
const logs = []
page.on('console', m => { if (m.text().includes('taskGraph')) logs.push(m.text().slice(0, 120)) })
page.on('pageerror', e => logs.push('PAGEERR: ' + String(e).slice(0, 120)))

await page.goto('http://localhost:8649/#/app/board?tab=observatory', { waitUntil: 'domcontentloaded' })

// 等 RunTraceOverview 挂载（最长 60s：vite 首访按需编译）
let mounted = true
try { await page.waitForSelector('.run-trace-overview', { timeout: 90000 }) } catch { mounted = false }
console.log('mounted:', mounted)

let verdict = { mounted, done: false, nodes: 0, loading: true }
if (mounted) {
  // 等加载完成：Loading 指示消失（最长 90s：793 任务全树+会话 trace 重建耗时）
  for (let i = 0; i < 110; i++) {
    await page.waitForTimeout(5000)
    const s = await page.evaluate(() => {
      const el = document.querySelector('.run-trace-overview')
      if (!el) return null
      const text = el.innerText
      const svgNodes = document.querySelectorAll('.run-trace-overview svg g.node, .run-trace-overview [class*="node"]').length
      return {
        loading: /Loading/i.test(text),
        progressPct: (text.match(/(\d+)%/) || [])[1] || '',
        svgNodes,
        textHead: text.slice(0, 160).replace(/\n/g, '|'),
      }
    })
    if (s) {
      verdict = { mounted: true, ...s, done: !s.loading && s.svgNodes > 0 }
      if (verdict.done || (i % 6 === 5)) console.log(`poll${i}:`, JSON.stringify(s).slice(0, 200))
      if (verdict.done) break
    }
  }
}
await page.screenshot({ path: '/tmp/obs-accept/observatory-final.png', fullPage: false })
console.log('VERDICT:', JSON.stringify({ ...verdict, logsTail: logs.slice(-3) }))
await browser.close()
process.exit(verdict.done ? 0 : 1)
