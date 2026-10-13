import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const BASE = 'http://127.0.0.1:8802'
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/qi.token', 'utf8').split('\n')[0].trim()
const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matrixAccessToken: mtok, matrixUserId: '@qi:matrix.test', deviceId: 'QIPROBE2', homeserverUrl: 'http://127.0.0.1:8008' }),
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
await page.waitForTimeout(6000)
const btn = page.locator('button:has-text("打开看板"), a:has-text("打开看板")').first()
console.log('打开看板 visible:', await btn.isVisible().catch(() => false))
if (await btn.isVisible().catch(() => false)) {
  await btn.click().catch(e => console.log('click err', e.message))
  await page.waitForTimeout(4000)
}
console.log('after click url:', page.url().replace(BASE, ''))
const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 300).replace(/\n+/g, ' | ')
console.log('body:', body)
const cols = await page.locator('[class*="lane" i], [class*="column" i], [class*="col-" i]').count().catch(() => 0)
console.log('lane/column-ish els:', cols)
await browser.close()
