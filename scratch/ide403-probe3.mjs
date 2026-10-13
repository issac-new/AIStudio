// Probe v3: does the proper hash URL /#/app/ide render the IDE shell?
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const BASE = 'http://127.0.0.1:8802'
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/fanfan.token', 'utf8').split('\n')[0].trim()
const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matrixAccessToken: mtok, matrixUserId: '@fanfan:matrix.test', deviceId: 'IDEPROBE3', homeserverUrl: 'http://127.0.0.1:8008' }),
}).then((r) => r.json())
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const bad = []
page.on('response', (res) => { if (res.status() >= 400 && res.url().startsWith(BASE)) bad.push(`${res.status()} ${res.url().replace(BASE, '').slice(0, 80)}`) })
await page.goto(BASE + '/login')
await page.evaluate(([token]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, [loginRes.token])
for (const u of ['/app/ide', '/app/ide?task=DEV-PAYCORE-S']) {
  bad.length = 0
  await page.goto(BASE + '/#' + u)
  await page.waitForTimeout(8000)
  const url = page.url().replace(BASE, '')
  const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 400).replace(/\n+/g, ' | ')
  const ideShell = await page.locator('.ide-shell, [class*="ide"]').count().catch(() => 0)
  console.log('=== target', u, '=> final', url)
  console.log('ide-ish elements:', ideShell)
  console.log('body head:', body)
  console.log('non-2xx:', [...new Set(bad)].join(' ;; ') || '(none)')
}
await browser.close()
