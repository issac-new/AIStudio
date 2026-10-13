// Probe v2: bare /app/ide landing — record URL transitions + API calls timeline.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/fanfan.token', 'utf8').split('\n')[0].trim()
const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matrixAccessToken: mtok, matrixUserId: '@fanfan:matrix.test', deviceId: 'IDEPROBE2', homeserverUrl: 'http://127.0.0.1:8008' }),
}).then((r) => r.json())

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const t0 = Date.now()
const timeline = []
const log = (kind, detail) => timeline.push(`${String(Date.now() - t0).padStart(5)}ms ${kind} ${detail}`)
page.on('response', (res) => {
  const u = res.url()
  if (u.startsWith(BASE) && !u.includes('.js') && !u.includes('.css') && !u.includes('.svg') && !u.includes('.png')) {
    log(`HTTP ${res.status()}`, `${res.request().method()} ${u.replace(BASE, '').slice(0, 90)}`)
  }
})
ctx.addInitScript(() => {
  const push = history.pushState.bind(history)
  history.pushState = (...a) => { console.info('[nav-push]', String(a[2])); return push(...a) }
})
page.on('console', (m) => { if (m.text().startsWith('[nav')) log('NAV', m.text()) })

await page.goto(BASE + '/login')
await page.evaluate(([token]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, [loginRes.token])
log('goto', '/app/ide')
await page.goto(BASE + '/app/ide')
for (let i = 0; i < 18; i++) { await page.waitForTimeout(500); log('url', page.url().replace(BASE, '')) }
await browser.close()
console.log(timeline.join('\n'))
