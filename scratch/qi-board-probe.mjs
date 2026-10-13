import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const BASE = 'http://127.0.0.1:8802'
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/qi.token', 'utf8').split('\n')[0].trim()
const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matrixAccessToken: mtok, matrixUserId: '@qi:matrix.test', deviceId: 'QIPROBE', homeserverUrl: 'http://127.0.0.1:8008' }),
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
for (const u of ['/#/app/board', '/#/app']) {
  await page.goto(BASE + u)
  await page.waitForTimeout(7000)
  const url = page.url().replace(BASE, '')
  const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 160).replace(/\n+/g, ' | ')
  const kanbanCols = await page.locator('[class*="kanban" i] [class*="column" i], [class*="board" i]').count().catch(() => 0)
  console.log('QI', u, '=> final', url, '| kanban-ish els:', kanbanCols, '| body:', body.slice(0, 120))
}
await browser.close()
