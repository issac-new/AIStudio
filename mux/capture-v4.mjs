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
  await page.goto(BASE + '/#' + url.replace(/^#/, ''))
  // 拍前去噪：CSS 隐藏版本通知 toast（严禁点击"知道了"=跳转劫持钮）+Esc 收浮层
  await page.addStyleTag({ content: '.n-notification{display:none!important}' }).catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  // 快门守门（8.4 规范）：目标组件非空且无加载态才拍；空/加载中重试，最终仍空=拒拍记缺陷
  if (opts.expect) {
    let gated = false
    for (let i = 0; i < 6 && !gated; i++) {
      gated = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        const spins = [...document.querySelectorAll('.n-spin, [class*="spin"]')]
        const spinning = spins.some((s) => getComputedStyle(s).display !== 'none' && !!s.offsetParent)
        return !!el && (el.innerText || '').trim().length > 0 && !spinning
      }, opts.expect).catch(() => false)
      if (!gated) await page.waitForTimeout(1500)
    }
    if (!gated) { console.error(`DEFECT[shutter-gate]: ${name} 目标 ${opts.expect} 空/加载中——拒拍（补数据或修组件后重拍）`); return }
  }
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
  // 文件名-内容对齐校验：落地路由与预期不符即记缺陷（防 ui-26 错拍类复发）
  if (opts.expectRoute && !new RegExp(opts.expectRoute).test(probe.url)) {
    console.error(`DEFECT[route-mismatch]: ${name} 落地 ${probe.url} ≠ 预期 /#${opts.expectRoute}`)
  }
  console.log('shot:', name, JSON.stringify(probe))
}
// 同画面去重：全量拍完按文件字节哈希报告重复帧（采集计划收敛依据）
async function reportDuplicateFrames() {
  const { createHash } = await import('node:crypto')
  const { readdirSync, statSync } = await import('node:fs')
  const bySize = new Map()
  try {
    for (const f of readdirSync(OUT)) {
      if (!f.endsWith('.png')) continue
      const p = `${OUT}/${f}`
      const { readFileSync } = await import('node:fs')
      const h = createHash('md5').update(readFileSync(p)).digest('hex')
      bySize.set(h, (bySize.get(h) || []).concat(f))
    }
  } catch { return }
  const dups = [...bySize.values()].filter((v) => v.length > 1)
  if (dups.length) console.warn('WARN[duplicate-frames]:', JSON.stringify(dups))
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
await shot('ui-26-report', '/app/gov', { wait: 5000 })

await reportDuplicateFrames()
await browser.close()
console.log('capture-v4 done')
