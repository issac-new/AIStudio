// 决定性实验（run16 复盘·产品根因）：同 deviceId（R18CAP）连续两次 matrix-login
// （模拟采集连发：每步一登），再用【第一次】的 JWT 打开 /app/board。
// 若 Synapse 同设备重登作废旧 token 且 studio 服务端按会话转发放行 → 前一上下文
// 的看板请求 401 → 客户端 triggerAuthRecheck 弹登录页 = run16 22 帧壳页根因实锤。
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const SIM_ROOT = process.env.AIPAY_SIM_ROOT || '/Volumes/nvme2230/lab/ncwk-sim-mux'
const BASE = 'http://127.0.0.1:8802'
const USER = 'fanfan'
const mtok = readFileSync(`${SIM_ROOT}/creds/${USER}.token`, 'utf8').split('\n')[0].trim()

async function login() {
  return fetch(`${BASE}/api/auth/matrix-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      matrixAccessToken: mtok, matrixUserId: `@${USER}:matrix.test`,
      deviceId: 'R18CAP', homeserverUrl: 'http://127.0.0.1:8008',
    }),
  }).then(r => r.json())
}

const A = await login()
console.log('登录 A OK（token 前 12 位）:', String(A.token).slice(0, 12))
const B = await login()
console.log('登录 B OK（token 前 12 位）:', String(B.token).slice(0, 12), '——B 是否作废 A 待验')

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const bad = []
page.on('response', r => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`.slice(0, 150))
})
await page.goto(BASE + '/login')
await page.evaluate(([token]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, [A.token])
await page.goto(BASE + '/#/app/board')
await page.waitForTimeout(8000)
console.log('A 会话最终 hash =', await page.evaluate(() => location.hash))
console.log('A 会话页面开头 =', JSON.stringify((await page.evaluate(() => document.body.innerText.slice(0, 120))).replace(/\n/g, ' | ')))
console.log('A 会话 4xx/5xx 响应:')
console.log(bad.slice(0, 15).join('\n') || '（无）')
await browser.close()
