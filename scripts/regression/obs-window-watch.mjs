// 窗口监测+自动验收：主树连续 3 次稳定（90s）→ 8649 验收走查（Loading 走完+拓扑渲染+截图）
import { chromium } from '@playwright/test'
import { execSync } from 'child_process'
import { mkdirSync } from 'fs'
mkdirSync('/tmp/obs-accept', { recursive: true })

const UP = '/Volumes/nvme2230/lab/ncwk/upstream/hermes-studio'
function snap() {
  try { return execSync(`git -C ${UP} status --porcelain | md5`, { encoding: 'utf8' }).trim() } catch { return 'ERR' }
}

// 1) 等窗口：连续 3 次同指纹
let last = '', stable = 0, waited = 0
while (stable < 3 && waited < 40 * 60 * 1000) {
  const s = snap()
  if (s === last && s !== 'ERR') stable++
  else { stable = 0; last = s }
  if (stable < 3) { await new Promise(r => setTimeout(r, 45000)); waited += 45000 }
}
console.log(`window: stable=${stable} waitedMs=${waited} snap=${last}`)
if (stable < 3) { console.log('VERDICT: NO-WINDOW'); process.exit(2) }

// 2) 验收走查（8649 若被杀则先探活）
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
const logs = []
page.on('console', m => { if (m.text().includes('taskGraph')) logs.push(m.text().slice(0, 110)) })
await page.goto('http://localhost:8649/#/app/board?tab=observatory', { waitUntil: 'domcontentloaded' })
let mounted = true
try { await page.waitForSelector('.run-trace-overview', { timeout: 60000 }) } catch { mounted = false }
let verdict = { mounted, done: false }
if (mounted) {
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000)
    const s = await page.evaluate(() => {
      const el = document.querySelector('.run-trace-overview')
      if (!el) return null
      const t = el.innerText
      return { loading: /Loading/i.test(t), svg: document.querySelectorAll('.run-trace-overview svg *').length }
    }).catch(() => null)
    if (s) {
      verdict = { mounted: true, ...s, done: !s.loading && s.svg > 8 }
      if (verdict.done) break
      if (i % 10 === 9) console.log(`poll${i}:`, JSON.stringify(s))
    }
  }
}
await page.screenshot({ path: '/tmp/obs-accept/observatory-window.png' })
console.log('VERDICT:', JSON.stringify({ ...verdict, logsTail: logs.slice(-2) }))
await browser.close()
process.exit(verdict.done ? 0 : 1)
