// capture-demo-v2.mjs — 推演报告 V2 真实 UI 截图（26 步对齐版 · v3 修正）
// v3 修正（首拍复盘）：
//   ① 会话：不再全新 matrix-login（新会话无 profile 可见性绑定，看板被 ACL 滤空），
//      改用 state.env 已验证的 jwt_<user>（API 实测 200 且返 34 卡）；
//   ② 预热：studio 重启后 kanban CLI 冷缓存 55s 级——先预拉 boards/重板/overview 热缓存；
//   ③ 等待：固定 sleep 改内容感知（readyText 60s），拍前确认目标内容真在画面。
// 用法：node capture-demo-v2.mjs [shot-name]
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const OUT = '/Volumes/nvme2230/lab/ncwk-sim-mux/evidence/20260928-product-demo/shots-v2'
mkdirSync(OUT, { recursive: true })

const SIM = '/Volumes/nvme2230/lab/ncwk-sim-mux'
const ANALYSIS_ROOM = '!ubRAvsUSUJTdTIiKEI:matrix.test'
const only = process.argv[2]

const mtok = {}
function tokenOf(user) {
  return readFileSync(`${SIM}/creds/${user}.token`, 'utf8').split('\n')[0].trim()
}

const jwt = {}
async function loginAs(user) {
  if (jwt[user]) return jwt[user]
  const res = await fetch(`${BASE}/api/auth/matrix-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      matrixAccessToken: tokenOf(user), matrixUserId: `@${user}:matrix.test`,
      deviceId: 'CAPTURE-V4', homeserverUrl: 'http://127.0.0.1:8008',
    }),
  }).then((r) => r.json())
  if (!res.token) throw new Error(`matrix-login(${user}) 失败: ` + JSON.stringify(res))
  jwt[user] = res.token
  return res.token
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.setDefaultTimeout(70000)

async function setSession(user, board) {
  await page.goto(BASE + '/login')
  await page.evaluate(([tk, bd]) => {
    localStorage.setItem('hermes_api_key', tk)
    localStorage.setItem('hermes_server_url', location.origin)
    localStorage.setItem('hermes_locale', 'zh')
    // 浏览器侧 matrix-js-sdk 凭据（snake_case 键，坑②）：房间/消息同步的真正前置
    localStorage.setItem('matrix_access_token', tokenOf(user))
    localStorage.setItem('matrix_user_id', `@${user}:matrix.test`)
    localStorage.setItem('matrix_device_id', 'CAPTURE-V2')
    localStorage.setItem('matrix_homeserver_url', 'http://127.0.0.1:8008')
    if (bd) localStorage.setItem('hermes.kanban.selectedBoard', bd)
  }, [await loginAs(user), board ?? 'fanfan-pm-plan'])
}

/** 公告横幅（491 非阻塞条）与遗留确认弹窗点灭。 */
async function dismissOverlays() {
  for (let i = 0; i < 3; i++) {
    const bannerBtn = page.locator('[data-testid="studio-announcement"] button').last()
    if (await bannerBtn.isVisible().catch(() => false)) {
      await bannerBtn.click().catch(() => {})
      await page.waitForTimeout(400)
      continue
    }
    break
  }
  for (const txt of ['Got it', 'Confirm', '确认', '确定', '知道了', '稍等', '稍后提醒']) {
    const btn = page.locator(`button:has-text("${txt}")`).first()
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(300) }
  }
}

/** 内容感知等待：readyText 出现（或兜底超时），再点灭覆盖物。 */
async function shot(name, url, opts = {}) {
  if (only && only !== name) return
  await setSession(opts.user ?? 'fanfan', opts.board)
  if (url && url !== '/login') url = '/#' + url
  if (url) await page.goto(BASE + url, { waitUntil: 'domcontentloaded' })
  if (opts.readyText) {
    await page.locator(`text=${opts.readyText}`).first()
      .waitFor({ state: 'visible', timeout: opts.readyTimeout ?? 65000 })
      .catch(() => console.log(`  [warn] ${name}: readyText "${opts.readyText}" 未在超时内出现`))
    await page.waitForTimeout(opts.settle ?? 2500)
  } else {
    await page.waitForTimeout(opts.wait ?? 3500)
  }
  await dismissOverlays()
  if (opts.after) await opts.after()
  await page.waitForTimeout(400)
  await dismissOverlays()
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot:', name)
}

// ── 预热：热服务器缓存 + 等 matrix 初始同步 ──
await setSession('fanfan')
await page.goto(BASE + '/#/app', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
await page.evaluate(async () => {
  const eps = [
    '/api/hermes/kanban/boards',
    '/api/hermes/kanban?board=fanfan-pm-plan',
    '/api/hermes/kanban?board=fei-test-mp',
    '/api/hermes/kanban/overview',
    '/api/governance/overview',
  ]
  await Promise.allSettled(eps.map((e) => fetch(e, { headers: { Authorization: `Bearer ${localStorage.getItem('hermes_api_key')}` } })))
})
await page.locator('text=支付收银台需求分析讨论群').first()
  .waitFor({ state: 'visible', timeout: 60000 })
  .catch(() => console.log('  [warn] 预热：房间列表 60s 未出现'))
console.log('warmup done')

// ── 开评审前置：fanfan 发起 uncommitted 域评审卡 ──
await fetch(`${BASE}/api/review`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.fanfan}` },
  body: JSON.stringify({
    reviewId: 'rev-capture-v4', taskId: 't_9e5c6c18', domain: 'uncommitted',
    headRef: 'wt/t_9e5c6c18',
  }),
}).then((r) => r.json()).then((r) => console.log('openReview:', JSON.stringify(r).slice(0, 80))).catch((e) => console.log('openReview fail:', e.message))

// ── 26 步证据 ──

// 步骤 3：登录页（等表单真出现）
await shot('s03-login', '/login', { board: null, wait: 6000 })

// 步骤 1/6：治理中心（人员/组织+六闸工件）
await shot('s01-people-org', '/app/gov', { readyText: '治理', settle: 3500 })

// 步骤 2/5：看板总览（板清单+卡真实在列）
await shot('s02-boards-registry', '/hermes/kanban?board=fanfan-pm-plan', { readyText: 'RFD-001', settle: 2500 })

// 步骤 4：驾驶舱工作台（房间列表+任务面板）
await shot('s04-smoke-cockpit', '/app', { readyText: '支付收银台需求分析讨论群', settle: 3000 })

// 步骤 7（G1）：治理中心 G1 冻结工件（点开六闸/工件全文）
await shot('s05-g1-freeze', '/app/gov', { readyText: 'G1', settle: 2500, after: async () => {
  const g1 = page.locator('text=/G1/').first()
  if (await g1.isVisible().catch(() => false)) { await g1.click().catch(() => {}); await page.waitForTimeout(2200) }
} })

// 步骤 8：需求分析讨论群（建群产物：群名+参与者+助理在群）
await shot('s06-room-created', `/app/s/group/${encodeURIComponent(ANALYSIS_ROOM)}`, { readyText: '需求分析讨论群', settle: 3500 })

// 步骤 9：派发指令消息
await shot('s07-dispatch-msg', `/app/s/group/${encodeURIComponent(ANALYSIS_ROOM)}`, { readyText: '需求分析讨论群', settle: 3000, after: async () => {
  const hit = page.locator('.mx_EventTile_body', { hasText: /派发|需求文档|RACI|Orchestrator/ }).last()
  if (await hit.isVisible().catch(() => false)) { await hit.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(1000) }
} })

// 步骤 10：fanfan-pm-plan RACI 徽章（等具体卡标题出现）
await shot('s08-kanban-raci', '/hermes/kanban?board=fanfan-pm-plan', { readyText: 'RFD-001', settle: 2500 })

// 步骤 10/11：任务抽屉 RACI 四元组（/app/board 深链）
await shot('s09-drawer-raci', '/app/board?task=t_9e5c6c18', { readyText: 'RFD-001', settle: 3000, readyTimeout: 70000 })

// 步骤 11：群内 RACI 派发消息
await shot('s10-raci-dispatch', `/app/s/group/${encodeURIComponent(ANALYSIS_ROOM)}`, { readyText: '需求分析讨论群', settle: 3000, after: async () => {
  const hit = page.locator('.mx_EventTile_body', { hasText: /RACI|主责|责任/ }).last()
  if (await hit.isVisible().catch(() => false)) { await hit.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(1000) }
} })

// 步骤 12：等您操作过滤器
await shot('s11-triage-mine', '/hermes/kanban?board=fanfan-pm-plan', {
  readyText: 'RFD-001', settle: 2000, after: async () => {
    const mine = page.locator('[data-testid="filter-mine-only"]').first()
    if (await mine.isVisible().catch(() => false)) { await mine.click().catch(() => {}); await page.waitForTimeout(1500) }
  },
})

// 步骤 13：IDE 简报 worktree 区块
await shot('s12-ide-worktree', '/ide?task=t_9e5c6c18', { readyText: 'RFD-001', settle: 3000, readyTimeout: 70000, after: async () => {
  const b = page.locator('button:has-text("简报"), [data-testid="ide-briefing-drawer"], .ide-briefing').first()
  if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(1800) }
} })

// 步骤 14：审批收件箱·评审卡待裁决（wei 操作人，新 UI）
await shot('s13-review-pending', '/app/inbox', { user: 'wei', readyText: '评审', settle: 2500 })

// 步骤 15（G2）：点击批准→决策历史记账（wei）
await shot('s14-archgate-approved', '/app/inbox', { user: 'wei', readyText: '评审', settle: 2000, after: async () => {
  const btn = page.locator('[data-testid="approval-btn-approve"]').first()
  if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(3000) }
} })

// 步骤 15：治理中心 G2 架构评审工件
await shot('s15-g2-archgate', '/app/gov', { readyText: 'G2', settle: 2500, after: async () => {
  const g2 = page.locator('text=/G2/').first()
  if (await g2.isVisible().catch(() => false)) { await g2.click().catch(() => {}); await page.waitForTimeout(2200) }
} })

// 步骤 16/17：排期拆单卡（T-101/T-102 真实在板）
await shot('s16-plan-cards', '/hermes/kanban?board=fanfan-pm-plan', { readyText: 'T-101', settle: 2500 })

// 步骤 18（G3）：IDE Git 面板
await shot('s17-ide-git', '/ide?task=t_9e5c6c18', { readyText: 'RFD-001', settle: 2500, readyTimeout: 70000, after: async () => {
  const g = page.locator('text=/^Git$|Git 活动/').first()
  if (await g.isVisible().catch(() => false)) { await g.click().catch(() => {}); await page.waitForTimeout(1800) }
} })

// 步骤 19（G4）：fei-test-mp 缺陷卡
await shot('s18-defect-cards', '/hermes/kanban?board=fei-test-mp', { readyText: '缺陷', settle: 2500, board: 'fei-test-mp' })

// 步骤 19：治理中心测试报告工件
await shot('s19-testreport-doc', '/app/gov', { readyText: '治理', settle: 2500, after: async () => {
  const t = page.locator('text=/测试报告|测试证据/').first()
  if (await t.isVisible().catch(() => false)) { await t.click().catch(() => {}); await page.waitForTimeout(2200) }
} })

// 步骤 20（G5）：治理中心发布准出工件
await shot('s20-release-gate', '/app/gov', { readyText: 'G5', settle: 2500, after: async () => {
  const g5 = page.locator('text=/G5/').first()
  if (await g5.isVisible().catch(() => false)) { await g5.click().catch(() => {}); await page.waitForTimeout(2200) }
} })

// 步骤 21：治理中心 UAT 验收工件
await shot('s21-uat-doc', '/app/gov', { readyText: 'UAT', settle: 2500, after: async () => {
  const u = page.locator('text=/UAT|验收/').first()
  if (await u.isVisible().catch(() => false)) { await u.click().catch(() => {}); await page.waitForTimeout(2200) }
} })

// 步骤 22：驾驶舱概览三卡
await shot('s22-dash-workmgr', '/app/dash', { readyText: '我的待办', settle: 3000, readyTimeout: 70000 })

// 步骤 23：治理中心审计工件
await shot('s23-audit-doc', '/app/gov', { readyText: '审计', settle: 2500, after: async () => {
  const a = page.locator('text=/审计/').first()
  if (await a.isVisible().catch(() => false)) { await a.click().catch(() => {}); await page.waitForTimeout(2200) }
} })

// 步骤 24（G6）：治理中心复盘工件
await shot('s24-retro-doc', '/app/gov', { readyText: '复盘', settle: 2500, after: async () => {
  const r = page.locator('text=/复盘|治理报告/').first()
  if (await r.isVisible().catch(() => false)) { await r.click().catch(() => {}); await page.waitForTimeout(2200) }
} })

// 步骤 25：IDE 任务简报抽屉六区块
await shot('s25-ide-briefing', '/ide?task=t_9e5c6c18', { readyText: 'RFD-001', settle: 3000, readyTimeout: 70000, after: async () => {
  const b = page.locator('button:has-text("简报"), [data-testid="ide-briefing-drawer"], .ide-briefing').first()
  if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(1800) }
} })

// 域1 人审兜底：命令审批（HIGH RISK 裁决面）
await shot('s26-cmd-approval', '/app/inbox', { user: 'wei', readyText: '审批', settle: 2500 })

await browser.close()
console.log('capture-demo-v2 done →', OUT)
