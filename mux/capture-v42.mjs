// capture-v42.mjs — 20260929 重构轮复跑截图（RUN_ID 参数化 + 三新特性位）
// 前提：sim studio :8802 / gateway :8801 / synapse :8008 在跑；本轮推演进行中或已收官
// 用法：RUN_ID=20260929-v4-run2 node capture-v42.mjs [only]   （only=位名；缺省全跑）
// 与 capture-v4.mjs（run1 专用）互不影响；登录真实 matrix-login（fanfan）。
// 新增位：
//   ui-08c-flow-timeline  P4③ 分析群右栏「任务流转」时间线（tdp-flow-sec 区域特写）
//   ui-08d-members        建群全量预邀实证（成员面板：人+agent 并排 17 号在列）
//   ui-20b-spotcheck      V4.1 抽检器：收件箱「抽检·自动放行回看」区（含真实自动放行条目）
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const RUN_ID = process.env.RUN_ID || '20260929-v4-run2'
const RUN_DIR = `/Volumes/nvme2230/lab/ncwk-sim-mux/runs/${RUN_ID}`
const OUT = `${RUN_DIR}/evidence/screenshots/steps`
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/fanfan.token', 'utf8').split('\n')[0].trim()

const state = {}
for (const line of readFileSync(`${RUN_DIR}/state.env`, 'utf8').split('\n')) {
  if (line.includes('=') && !line.startsWith('jwt_')) {
    const i = line.indexOf('='); state[line.slice(0, i).trim()] = state[line.slice(0, i).trim()] ?? line.slice(i + 1).trim()
  }
}
const ROOM = state.room_analysis || ''
console.log('RUN_ID =', RUN_ID, '| room_analysis =', ROOM)
if (!ROOM) console.log('WARN: state 无 room_analysis（推演未到建群步？）')

const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: mtok, matrixUserId: '@fanfan:matrix.test',
    deviceId: 'CAPTURE-V42', homeserverUrl: 'http://127.0.0.1:8008',
  }),
}).then((r) => r.json())
if (!loginRes.token) throw new Error('matrix-login 失败: ' + JSON.stringify(loginRes))

const only = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

await page.goto(BASE + '/login')
await page.evaluate(([token, mtok2]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
  localStorage.setItem('hermes.kanban.selectedBoard', 'fanfan-pm-plan')
  localStorage.setItem('matrix_access_token', mtok2)
  localStorage.setItem('matrix_user_id', '@fanfan:matrix.test')
  localStorage.setItem('matrix_device_id', 'CAPTURE-V42')
  localStorage.setItem('matrix_homeserver_url', 'http://127.0.0.1:8008')
}, [loginRes.token, mtok])

async function shot(name, url, opts = {}) {
  if (only && only !== name) return
  await page.goto(BASE + '/#' + url.replace(/^#/, ''))
  await page.waitForTimeout(opts.wait ?? 4000)
  // ⚠️ 不点任何弹窗按钮："知道了"=通知跳转钮，点击即劫持导航到 board?task=<卡>
  // （run2 实锤：五连拍全被劫持到 t_666aecf8；去掉 Dismiss 循环后全部正确落位）
  if (opts.after) await opts.after()
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(opts.fullPage ? { fullPage: true } : {}) })
  const probe = await page.evaluate(() => {
    const q = (s) => !!document.querySelector(s)
    return {
      url: location.hash || location.pathname,
      hasLogin: !!document.querySelector('input[type=password]'),
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
    }
  })
  console.log('shot:', name, JSON.stringify(probe))
}

/** 遍历同名房间点选命中本轮 room_analysis（深链不驱动选择，run1 实锤）。 */
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
    if (!ROOM || page.url().includes(ROOM.slice(0, 12))) return true
  }
  return false
}

// ── 驾驶舱全景 + P5 概览 ──
await shot('ui-03-cockpit', '/app', { wait: 6000 })
await shot('ui-03b-dash', '/app/dash', { wait: 5000 })

// ── 分析群：全景 + P4③ 时间线特写 + 成员面板（全量预邀实证）──
if (await openCurrentRoom()) {
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/ui-08-groupchat.png` })
  console.log('shot: ui-08-groupchat')

  // P4③：右栏「任务流转」节区域特写（存在性随消息流；缺失时也截全栏供审计）
  if (!only || only === 'ui-08c-flow-timeline') {
    const sec = page.locator('[data-testid="tdp-flow-sec"]')
    if (await sec.isVisible().catch(() => false)) {
      await sec.scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(600)
      await sec.screenshot({ path: `${OUT}/ui-08c-flow-timeline.png` })
      console.log('shot: ui-08c-flow-timeline (P4③ 时间线出数)')
    } else {
      const tdp = page.locator('[data-testid="tdp"]')
      if (await tdp.isVisible().catch(() => false)) {
        await tdp.screenshot({ path: `${OUT}/ui-08c-flow-timeline.png` })
        console.log('shot: ui-08c-flow-timeline (tdp 全栏——时间线节未出，如实留档)')
      } else {
        console.log('WARN: tdp 面板不可见，跳过 ui-08c')
      }
    }
  }

  // 成员面板：点开成员列表截图（预邀实证；按钮文案自适应兜底两轮）
  if (!only || only === 'ui-08d-members') {
    for (const label of ['成员', 'Members', '参与者']) {
      const btn = page.locator(`button:has-text("${label}")`).first()
      if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(1500); break }
    }
    await page.screenshot({ path: `${OUT}/ui-08d-members.png` })
    console.log('shot: ui-08d-members')
  }

  // 消息卡链接特写（滚动到底部最新派发/回执）
  if (!only || only === 'ui-08b-msgcard') {
    await page.evaluate(() => {
      const sc = [...document.querySelectorAll('[class*=timeline],[class*=messages]')].pop()
      if (sc) sc.scrollTop = sc.scrollHeight
    })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/ui-08b-msgcard.png` })
    console.log('shot: ui-08b-msgcard')
  }
} else {
  console.log('WARN: 本轮房间未在列表命中')
}

// ── 看板 RACI + 等您操作 ──
await shot('ui-10-kanban', '/hermes/kanban?board=fanfan-pm-plan', { wait: 4500 })

// ── 收件箱：三档分区全景 + V4.1 抽检区特写 ──
await shot('ui-20-inbox', '/app/inbox', { wait: 4500 })
if (!only || only === 'ui-20b-spotcheck') {
  const sec = page.locator('[data-testid="approval-spotcheck"]')
  if (await sec.isVisible().catch(() => false)) {
    await sec.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(600)
    await sec.screenshot({ path: `${OUT}/ui-20b-spotcheck.png` })
    console.log('shot: ui-20b-spotcheck (V4.1 抽检区)')
  } else {
    console.log('WARN: 抽检区不可见（本轮尚无自动放行条目或区域为空）——ui-20-inbox 全景已含该区状态')
  }
}

// ── IDE 任务简报 + 治理面 ──
const ideTask = process.env.IDE_TASK || state.card_review_rfd || ''
await shot('ui-25-ide', `/ide${ideTask ? `?task=${ideTask}` : ''}`, { wait: 6000 })
await shot('ui-26-report', '/app/gov', { wait: 5000 })

await browser.close()
console.log('capture-v42 done')
