import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const BASE = 'http://127.0.0.1:8802'
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/qi.token', 'utf8').split('\n')[0].trim()
const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matrixAccessToken: mtok, matrixUserId: '@qi:matrix.test', deviceId: 'QIPROBE3', homeserverUrl: 'http://127.0.0.1:8008' }),
}).then((r) => r.json())
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(BASE + '/login')
await page.evaluate(([token]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, [loginRes.token])
await page.goto(BASE + '/#/app/board')
await page.waitForTimeout(8000)
const hasBoard = async () => (await page.locator('body').innerText().catch(() => '')).includes('swarm kanban\nBlocked') || (await page.locator('[class*="lane" i]').count()) > 3
console.log('board before dismiss:', await hasBoard())
// 复刻 r18 dismissPopups
for (const txt of ['Confirm', '确认', '确定', '知道了', '稍等', '稍后提醒', '开始使用', '立即体验', '跳过']) {
  const btn = page.locator(`button:has-text("${txt}")`).first()
  if (await btn.isVisible().catch(() => false)) { console.log('dismiss clicked:', txt); await btn.click().catch(() => {}); await page.waitForTimeout(400) }
}
for (const aria of ['close', '关闭', 'Close']) {
  const btn = page.locator(`[aria-label="${aria}"], button:has-text("×")`).first()
  if (await btn.isVisible().catch(() => false)) { console.log('dismiss clicked close:', aria); await btn.click().catch(() => {}); await page.waitForTimeout(300) }
}
await page.waitForTimeout(2000)
console.log('board after dismiss:', await hasBoard())
console.log('url now:', page.url().replace(BASE, ''))
const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 200).replace(/\n+/g, ' | ')
console.log('body:', body)
await browser.close()
