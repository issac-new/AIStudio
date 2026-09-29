// _probe-fleet.mjs v4 — cockpit-online-zero 根因判别：addInitScript 预播种（早于一切应用代码）
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/fanfan.token', 'utf8').split('\n')[0].trim()
const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matrixAccessToken: mtok, matrixUserId: '@fanfan:matrix.test', deviceId: 'FLEET-PROBE', homeserverUrl: 'http://127.0.0.1:8008' }),
}).then((r) => r.json())
if (!loginRes.token) throw new Error('login failed')
globalThis.__seedTok = loginRes.token
try { console.log('SEEDED payload:', Buffer.from(loginRes.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString().slice(0, 160)) } catch {}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } })
const page = await ctx.newPage()
const fleetFrames = []
page.on('websocket', (ws) => {
  const url = ws.url()
  if (url.includes('/fleet/events')) {
    console.log('[ws-fleet]', url.slice(0, 90) + (url.includes('token=') ? ' …token=YES' : ' …token=NO'))
    ws.on('framereceived', (f) => { try { fleetFrames.push(JSON.parse(f.payload)) } catch {} })
    ws.on('close', () => console.log('[ws-fleet] CLOSED'))
  }
})
await ctx.addInitScript((token, mtok2) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
  localStorage.setItem('hermes.kanban.selectedBoard', 'fanfan-pm-plan')
  localStorage.setItem('matrix_access_token', mtok2)
  localStorage.setItem('matrix_user_id', '@fanfan:matrix.test')
  localStorage.setItem('matrix_device_id', 'CAPTURE-V42')
  localStorage.setItem('matrix_homeserver_url', 'http://127.0.0.1:8008')
}, [loginRes.token, mtok])
page.on('response', async (r) => {
  if (r.url().includes('/api/') && r.status() >= 400) {
    if (r.url().includes('/api/auth/me')) { const h = r.request().headers(); console.log('[auth/me]', r.status(), 'full-token==seeded:', (h['authorization'] || '') === ('Bearer ' + globalThis.__seedTok), 'sig-tail:', (h['authorization'] || '').slice(-18)) }
    const h = r.request().headers()
    let pl = 'NONE'
    if (h['authorization']) { try { pl = Buffer.from(h['authorization'].split('.')[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString().slice(0, 130) } catch { pl = 'decode-fail' } }
    console.log('[http]', r.status(), r.url().slice(0, 70), '| payload:', pl)
  }
})
page.on('requestfailed', (r) => { if (r.url().includes('/api/')) console.log('[net-fail]', r.url().slice(0, 110)) })
await page.goto(BASE + '/#/app')
await page.waitForTimeout(12000)
console.log('page url:', page.url())
console.log('api_key still set:', await page.evaluate(() => !!localStorage.getItem('hermes_api_key')))
const chips = await page.evaluate(() => {
  const q = (sel) => document.querySelector(sel)?.innerText?.replace(/\s+/g, ' ') || null
  return { tasks: q('[data-testid="sit-tasks"]'), online: q('[data-testid="sit-online"]') }
})
console.log('chips:', JSON.stringify(chips))
const snaps = fleetFrames.filter((f) => f.type === 'snapshot')
console.log('fleet snapshots:', snaps.length)
if (snaps[0]) {
  const arr = snaps[0].sessions || []
  console.log('fleet sessions:', arr.length, arr.slice(0, 4).map((x) => ({ id: x.id, profile: x.profile, status: x.status })))
}
await browser.close()
