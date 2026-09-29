// _probe-room.mjs — 新驾驶舱（⑤后）房间呈现位置探查：openCurrentRoom 未命中排查
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const BASE = 'http://127.0.0.1:8802'
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/fanfan.token', 'utf8').split('\n')[0].trim()
const loginRes = await fetch(BASE + '/api/auth/matrix-login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matrixAccessToken: mtok, matrixUserId: '@fanfan:matrix.test', deviceId: 'ROOM-PROBE', homeserverUrl: 'http://127.0.0.1:8008' }),
}).then((r) => r.json())
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
await page.goto(BASE + '/login')
await page.evaluate((token, mtok2) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
  localStorage.setItem('hermes.kanban.selectedBoard', 'fanfan-pm-plan')
  localStorage.setItem('matrix_access_token', mtok2)
  localStorage.setItem('matrix_user_id', '@fanfan:matrix.test')
  localStorage.setItem('matrix_device_id', 'ROOM-PROBE')
  localStorage.setItem('matrix_homeserver_url', 'http://127.0.0.1:8008')
}, [loginRes.token, mtok])
await page.goto(BASE + '/#/app')
await page.waitForTimeout(9000)
for (const txt of ['知道了', '确定']) {
  const btn = page.locator('button:has-text("' + txt + '")').first()
  if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(400) }
}
// 1) 页面上是否有房间名文本（任意容器）
const hit = page.locator('text=支付收银台需求分析讨论群').first()
console.log('房间名可见（任意位置）:', await hit.isVisible({ timeout: 4000 }).catch(() => false))
// 2) 结构勘察：左栏/中栏/注意力条的可见文本摘要
const probes = await page.evaluate(() => {
  const q = (sel) => [...document.querySelectorAll(sel)].slice(0, 6).map(e => (e.innerText || '').trim().slice(0, 50)).filter(Boolean)
  return {
    testids: [...document.querySelectorAll('[data-testid]')].slice(0, 40).map(e => e.getAttribute('data-testid')),
    railTexts: q('[data-testid*="rail"] li, [data-testid*="rail"] a, [data-testid*="rail"] button'),
    stripTexts: q('[data-testid="attention-strip"] button, [data-testid*="strip"] button'),
    bodySample: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
  }
})
console.log(JSON.stringify(probes, null, 1))
await page.screenshot({ path: '/tmp/cockpit-app-roomview.png' })
console.log('screenshot /tmp/cockpit-app-roomview.png')
await browser.close()
