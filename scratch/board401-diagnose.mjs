// 诊断脚本（run16 复盘·产品根因现场取证）：模拟 r18-frames 采集会话走 /app/board，
// 监听全部响应，钉死「看板页弹回登录页」的 401 端点。只读诊断，不改任何产品文件。
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const SIM_ROOT = process.env.AIPAY_SIM_ROOT || '/Volumes/nvme2230/lab/ncwk-sim-mux'
const BASE = process.env.MX_STUDIO_BASE || 'http://127.0.0.1:8802'
const USER = process.env.DIAG_USER || 'fanfan'
const mtok = readFileSync(`${SIM_ROOT}/creds/${USER}.token`, 'utf8').split('\n')[0].trim()

const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: mtok, matrixUserId: `@${USER}:matrix.test`,
    deviceId: 'R18CAP', homeserverUrl: 'http://127.0.0.1:8008',
  }),
}).then(r => r.json())
if (!loginRes.token) { console.log('matrix-login 失败:', JSON.stringify(loginRes)); process.exit(1) }

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const bad = []
page.on('response', r => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`.slice(0, 160))
})
await page.goto(BASE + '/login')
await page.evaluate(([token]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, [loginRes.token])
await page.goto(BASE + '/#/app/board')
await page.waitForTimeout(8000)
const hash = await page.evaluate(() => location.hash)
const bodyHead = await page.evaluate(() => document.body.innerText.slice(0, 200))
console.log('最终 hash =', hash)
console.log('页面开头 =', JSON.stringify(bodyHead.slice(0, 120)))
console.log('4xx/5xx 响应（前 20 条）:')
console.log(bad.slice(0, 20).join('\n') || '（无）')
await browser.close()
