// capture-ui.mjs — 推演报告真实 UI 截图（中文界面 + 真实数据 + 人操作视角）
// 前提：sim studio :8802 在跑（sim 数据），gateway :8801 + synapse :8008 在跑
// 登录：真实 matrix-login（服务端建立 matrix 会话，房间/协作数据才会流动）
// 用法：node capture-ui.mjs [only]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const OUT = '/Volumes/nvme2230/lab/ncwk-sim-mux/evidence/screenshots/steps'
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/fanfan.token', 'utf8').split('\n')[0].trim()
const ROOM_ANALYSIS = '!ubRAvsUSUJTdTIiKEI:matrix.test'

// 真实 matrix 登录（拿服务端会话与 JWT）
const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: mtok, matrixUserId: '@fanfan:matrix.test',
    deviceId: 'CAPTURE', homeserverUrl: 'http://127.0.0.1:8008',
  }),
}).then((r) => r.json())
if (!loginRes.token) throw new Error('matrix-login 失败: ' + JSON.stringify(loginRes))
console.log('login ok:', loginRes.user?.username)

const only = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

await page.goto(BASE + '/login')
await page.evaluate(([token]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
  localStorage.setItem('hermes.kanban.selectedBoard', 'fanfan-pm-plan')
}, [loginRes.token])

async function shot(name, url, opts = {}) {
  if (only && only !== name) return
  await page.goto(BASE + url)
  await page.waitForTimeout(opts.wait ?? 3000)
  for (const txt of ['Confirm', '确认', '确定', '知道了']) {
    const btn = page.locator(`button:has-text("${txt}")`).first()
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(500) }
  }
  if (opts.after) await opts.after()
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot:', name)
}

// ① 驾驶舱全景（房间 + 任务面板真实数据）
await shot('ui-03-cockpit', '/app', { wait: 6000 })

// ② 群聊（需求分析讨论群，真实消息流）
await shot('ui-08-groupchat', `/app/s/group/${encodeURIComponent(ROOM_ANALYSIS)}`, { wait: 5000 })

// ③ 看板（fanfan-pm-plan 真实卡片；预选板 + 兜底点选）
await shot('ui-10-kanban', '/hermes/kanban?board=fanfan-pm-plan', {
  wait: 4000,
  after: async () => {
    const sel = page.locator('text=/看板:.*Default/').first()
    if (await sel.isVisible().catch(() => false)) {
      await sel.click().catch(() => {})
      await page.waitForTimeout(600)
      const opt = page.locator('text=fanfan-pm-plan').first()
      if (await opt.isVisible().catch(() => false)) { await opt.click().catch(() => {}); await page.waitForTimeout(2200) }
    }
  },
})

// ④ 审批收件箱（人的审核把关 UI · P1）
await shot('ui-20-inbox', '/app/inbox', { wait: 4000 })

// ⑤ IDE 工作台（任务跳转 + 简报）
await shot('ui-25-ide', '/ide?task=t_9e5c6c18', { wait: 5000 })

// ⑥ 模型设置（IDE 内 Models 页）
await shot('ui-25-models', '/ide', {
  wait: 3500,
  after: async () => {
    const m = page.locator('text=/^Models$|^模型$/').first()
    if (await m.isVisible().catch(() => false)) { await m.click().catch(() => {}); await page.waitForTimeout(2500) }
  },
})

await browser.close()
console.log('ui capture done')
