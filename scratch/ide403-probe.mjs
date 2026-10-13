// One-off probe: reproduce bare /app/ide cold load as fanfan against the sim
// studio (8802) and log every non-2xx API response (esp. 403) to pin the
// endpoint behind the permission toast. Read-only: no clicks, no screenshots
// into run evidence dirs; output goes to stdout only.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const USER = 'fanfan'
const mtok = readFileSync(`/Volumes/nvme2230/lab/ncwk-sim-mux/creds/${USER}.token`, 'utf8').split('\n')[0].trim()
const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: mtok, matrixUserId: `@${USER}:matrix.test`,
    deviceId: 'IDEPROBE', homeserverUrl: 'http://127.0.0.1:8008',
  }),
}).then((r) => r.json())
if (!loginRes.token) throw new Error('matrix-login failed: ' + JSON.stringify(loginRes))

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const bad = []
page.on('response', (res) => {
  const s = res.status()
  if (s >= 300 && !((s >= 300 && s < 400) && res.request().isNavigationRequest())) {
    const url = res.url()
    if (url.startsWith(BASE)) bad.push(`${s} ${res.request().method()} ${url.replace(BASE, '')}`)
  }
})

await page.goto(BASE + '/login')
await page.evaluate(([token]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, [loginRes.token])

await page.goto(BASE + '/app/ide')
await page.waitForTimeout(9000) // let cold-load chain fire

const toastText = await page.locator('.n-message').allTextContents().catch(() => [])
const chatPlaceholder = await page.locator('text=开始群聊对话').count().catch(() => 0)
const url = page.url()
await browser.close()

console.log('final url:', url)
console.log('chat placeholder visible:', chatPlaceholder > 0)
console.log('toasts:', JSON.stringify(toastText))
console.log('non-2xx responses (dedup):')
for (const line of [...new Set(bad)]) console.log(' ', line)
// v2 additions appended below (rerun with URL timeline)
