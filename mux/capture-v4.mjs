// capture-v4.mjs — V4-run1 真实 UI 截图（本轮房间/卡号自适应 + 12/18/26 新位）
// 前提：sim studio :8802 / gateway :8801 / synapse :8008 在跑；推演进行中或已收官
// 用法：node capture-v4.mjs [only]   （only=位名，如 ui-08-groupchat；缺省全跑）
// 登录：真实 matrix-login（fanfan）；数据全部来自本轮 RUN_ID=20260928-v4-run1
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const RUN_DIR = '/Volumes/nvme2230/lab/ncwk-sim-mux/runs/20260928-v4-run1'
const OUT = `${RUN_DIR}/evidence/screenshots/steps`
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/fanfan.token', 'utf8').split('\n')[0].trim()

// 本轮 state.env 直读（房间/卡号随跑随新）
const state = {}
for (const line of readFileSync(`${RUN_DIR}/state.env`, 'utf8').split('\n')) {
  if (line.includes('=') && !line.startsWith('jwt_')) {
    const i = line.indexOf('='); state[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
}
const ROOM = state.room_analysis || '!FurImZOaeHVyUqaRQR:matrix.test'
console.log('room_analysis =', ROOM)

const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: mtok, matrixUserId: '@fanfan:matrix.test',
    deviceId: 'CAPTURE-V4', homeserverUrl: 'http://127.0.0.1:8008',
  }),
}).then((r) => r.json())
if (!loginRes.token) throw new Error('matrix-login 失败: ' + JSON.stringify(loginRes))
console.log('login ok:', loginRes.user?.username)

const only = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

await page.goto(BASE + '/login')
await page.evaluate(([token, mtok2]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
  localStorage.setItem('hermes.kanban.selectedBoard', 'fanfan-pm-plan')
  // matrix 客户端四键（matrix-chat/stores/matrix-credentials.ts）：缺此四键
  // matrix client 永远 No credentials → 房间列表空/房间画布不挂（V4-run1 实锤）
  localStorage.setItem('matrix_access_token', mtok2)
  localStorage.setItem('matrix_user_id', '@fanfan:matrix.test')
  localStorage.setItem('matrix_device_id', 'CAPTURE-V4')
  localStorage.setItem('matrix_homeserver_url', 'http://127.0.0.1:8008')
}, [loginRes.token, mtok])

async function shot(name, url, opts = {}) {
  if (only && only !== name) return
  // hash 路由铁律：SPA 用 createWebHashHistory，path URL 一律被重定向回 #/app
  // （V3 实锤"落点漂移"）；采集必须走 /#<path>
  await page.goto(BASE + '/#' + url.replace(/^#/, ''))
  await page.waitForTimeout(opts.wait ?? 4000)
  // 演示弹窗逐一点掉（确认/稍等/稍后提醒；加载期禁用属正常，能点即点）
  for (const txt of ['Confirm', '确认', '确定', '知道了', '稍等', '稍后提醒']) {
    const btn = page.locator(`button:has-text("${txt}")`).first()
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(500) }
  }
  if (opts.after) await opts.after()
  await page.screenshot({ path: `${OUT}/${name}.png` })
  // 落点自证：URL + 关键 DOM 锚点（防"登录页假截图"——不可见时须人工处置）
  const probe = await page.evaluate(() => {
    const q = (s) => !!document.querySelector(s)
    return {
      url: location.hash || location.pathname,
      title: document.title.slice(0, 40),
      hasApp: q('#app'), hasLogin: !!document.querySelector('input[type=password]'),
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
    }
  })
  console.log('shot:', name, JSON.stringify(probe))
}

// 步骤 3/4：驾驶舱全景 + P5 概览三卡
await shot('ui-03-cockpit', '/app', { wait: 6000 })
await shot('ui-03b-dash', '/app/dash', { wait: 5000 })

// 步骤 8/9/12：matrix 房间画布（ia2.commsRoom）真实消息流 + P4 卡链接/@我高亮 + 任务时间线。
// 同名房间多轮并存（V3/V4 各建一个"支付收银台需求分析讨论群"）：深链 URL 会被
// 工作台 auto-select 忽略——必须遍历同名列表项逐个点选，命中本轮房间 ID 为止。
async function openCurrentRoom() {
  await page.goto(BASE + '/#/app')
  await page.waitForTimeout(9000)
  for (const txt of ['知道了', '确定', '稍后提醒']) {
    const btn = page.locator(`button:has-text("${txt}")`).first()
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(300) }
  }
  const items = page.locator('text=支付收银台需求分析讨论群')
  const n = await items.count().catch(() => 0)
  for (let i = 0; i < n; i++) {
    await items.nth(i).click({ timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(5500)
    if (page.url().includes(ROOM.slice(0, 12))) return true
  }
  return false
}
if (await openCurrentRoom()) {
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/ui-08-groupchat.png` })
  console.log('shot: ui-08-groupchat (clicked room ' + ROOM.slice(0, 12) + ')')
  // 消息卡链接特写：滚动到最新消息（派发/回执区）
  await page.evaluate(() => {
    const sc = [...document.querySelectorAll('[class*=timeline],[class*=messages]')].pop()
    if (sc) sc.scrollTop = sc.scrollHeight
  })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/ui-08b-msgcard.png` })
  console.log('shot: ui-08b-msgcard')
} else {
  console.log('WARN: current-run room not found in list')
}

// 步骤 10：看板 RACI 徽章 + 等您操作过滤（P2）
await shot('ui-10-kanban', '/hermes/kanban?board=fanfan-pm-plan', { wait: 4500 })
await shot('ui-10b-kanban-mine', '/hermes/kanban?board=fanfan-pm-plan', {
  wait: 4500,
  after: async () => {
    const mine = page.locator('[data-testid="filter-mine-only"]').first()
    if (await mine.isVisible().catch(() => false)) { await mine.click().catch(() => {}); await page.waitForTimeout(1500) }
  },
})

// 步骤 18/20：审批收件箱（V4-N1 三档分区 + 待裁决实况，不点不扰跑）
await shot('ui-18-inbox-live', '/app/inbox', { wait: 4500 })
await shot('ui-20-inbox', '/app/inbox', { wait: 4500 })

// 步骤 25：IDE 任务简报联动（卡号取本轮主卡；缺省回落 state 里的 card_review_rfd）
const ideTask = process.env.IDE_TASK || state.card_review_rfd || ''
await shot('ui-25-ide', `/ide${ideTask ? `?task=${ideTask}` : ''}`, { wait: 6000 })

// 步骤 26：报告自身（生成后重跑本位）
// ui-26-report：第 26 步交付物=本报告自身——直拍生成的 simulation-report.html 首屏（治"拍成治理中心"错拍）
if (!only || only === 'ui-26-report') {
  await page.goto('file://' + RUN_DIR + '/evidence/simulation-report.html', { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/ui-26-report.png` })
  console.log('shot: ui-26-report (report file first screen)')
}

await browser.close()
console.log('capture-v4 done')
