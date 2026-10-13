// Probe v4: path-form URLs for cockpit pages — where do they actually land?
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const BASE = 'http://127.0.0.1:8802'
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/fanfan.token', 'utf8').split('\n')[0].trim()
const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matrixAccessToken: mtok, matrixUserId: '@fanfan:matrix.test', deviceId: 'IDEPROBE4', homeserverUrl: 'http://127.0.0.1:8008' }),
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
for (const u of ['/app/board', '/app/board?tab=trace', '/app/runs', '/app/cases']) {
  await page.goto(BASE + u)
  await page.waitForTimeout(6500)
  const url = page.url().replace(BASE, '')
  const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 150).replace(/\n+/g, ' | ')
  console.log('PATH', u, '=> final', url, '| body:', body)
}
await browser.close()
