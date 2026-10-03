// capture-run2-sup.mjs — run2 旅程报告缺图步补拍（治理中心工件位+看板交互位）
// 沿 capture-v42.mjs 的登录/房间选择机制；OUT=run2 steps 目录；只补缺失键。
import { chromium } from 'playwright'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const RUN_ID = process.env.RUN_ID || '20260929-v4-run2'
const RUN_DIR = `/Volumes/nvme2230/lab/ncwk-sim-mux/runs/${RUN_ID}`
const OUT = `${RUN_DIR}/evidence/screenshots/steps`
mkdirSync(OUT, { recursive: true })
// CAPTURE_USER：治理中心为全局视图，用无 wm 任务窗抢占的账号（admin 实测稳定；
// fanfan 会话被"待人工门"注意力队列周期性劫持路由——run2 收口实测）可稳定成图。
const USER = process.env.CAPTURE_USER || 'fanfan'
const MXID = `@${USER}:matrix.test`
const mtok = readFileSync(`/Volumes/nvme2230/lab/ncwk-sim-mux/creds/${USER}.token`, 'utf8').split('\n')[0].trim()

const state = {}
for (const line of readFileSync(`${RUN_DIR}/state.env`, 'utf8').split('\n')) {
  if (line.includes('=') && !line.startsWith('jwt_')) {
    const i = line.indexOf('='); state[line.slice(0, i).trim()] = state[line.slice(0, i).trim()] ?? line.slice(i + 1).trim()
  }
}
const ROOM = state.room_analysis || ''

const loginRes = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: mtok, matrixUserId: MXID,
    deviceId: `CAPTURE-R2SUP-${Date.now()}`, homeserverUrl: 'http://127.0.0.1:8008',
  }),
}).then((r) => r.json())
if (!loginRes.token) throw new Error('matrix-login 失败: ' + JSON.stringify(loginRes))

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2, locale: 'zh-CN' })
const page = await ctx.newPage()
await page.goto(BASE + '/login')
await page.evaluate(([token, mtok2, mxid]) => {
  localStorage.setItem('hermes_api_key', token)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
  localStorage.setItem('hermes.kanban.selectedBoard', 'fanfan-pm-plan')
  localStorage.setItem('matrix_access_token', mtok2)
  localStorage.setItem('matrix_user_id', mxid)
  localStorage.setItem('matrix_device_id', 'CAPTURE-R2SUP')
  localStorage.setItem('matrix_homeserver_url', 'http://127.0.0.1:8008')
}, [loginRes.token, mtok, MXID])
// 必须整页 boot 到 /#/app：停在 /login 只改 hash 不进应用（v2 实测），wm 会把首屏
// 重定向到 /app/board?task=…（竞态，v3/v4 实测）且伴随视图崩溃——干净 boot 判据
// = hash 不带 /app/board?task= 且无 pageerror；不干净则整页重来（≤4 次）。
const pageErrs = []
page.on('pageerror', (e) => pageErrs.push(String(e).slice(0, 90)))
for (let i = 0; i < 4; i++) {
  pageErrs.length = 0
  await page.goto(BASE + '/#/app')
  await page.waitForTimeout(9000)
  await dismissOverlays()
  const h = await page.evaluate(() => location.hash)
  console.log(`boot try${i}: hash=${h} errs=${pageErrs.length}`)
  if (!h.includes('/app/board?task=') && pageErrs.length === 0) break
}

async function dismissOverlays() {
  // 拍前去噪（V5 §8.4②）：CSS 隐藏公告横幅/版本通知与 naive 通知，不点任何弹窗按钮——
  // 公告按钮=跳转劫持钮（run2 五连拍被劫持到 t_666aecf8 实锤；旧实现点击式去噪+boot
  // 重试是绕坑不是根治，2026-10-02 改 CSS 隐藏从源头不触发导航）。
  await page.addStyleTag({ content: '.n-notification,.announcement-banner,[data-testid="studio-announcement"]{display:none!important}' }).catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
}

async function goHash(url, verify) {
  // wm 任务态会把整页 goto 重定向到 /app/board?task=…（实测）；SPA 内换 hash 才进目标视图。
  // hash 到位≠视图到位（wm 任务窗霸屏时 hash 粘住但视图不渲染）——verify 做视图级校验。
  const target = '#' + url.replace(/^#/, '')
  for (let i = 0; i < 4; i++) {
    // 反劫持守卫：注意力队列会周期性把路由拽回 /app/board?task=…（run2 收口实测
    // 跨账号发生）——hashchange 被拽立即拽回目标视图，与劫持源抢路由。
    await page.evaluate((h) => {
      window.__keepHash = h
      if (!window.__keepHashHook) {
        window.__keepHashHook = true
        window.addEventListener('hashchange', () => {
          if (window.__keepHash && location.hash !== window.__keepHash
              && !location.hash.startsWith(window.__keepHash.split('?')[0])) {
            location.hash = window.__keepHash
          }
        })
      }
      location.hash = h
    }, target)
    await page.waitForTimeout(3500)
    const at = await page.evaluate(() => location.hash)
    const ok = at.startsWith(target.split('?')[0]) && (!verify || (await verify()))
    if (ok) return true
    console.log('  [nav-retry]', target, 'hash=', at, 'verify=', verify ? await verify() : '-')
    await page.keyboard.press('Escape').catch(() => {})
    const back = page.locator('text=返回').first()
    if (await back.isVisible().catch(() => false)) await back.click().catch(() => {})
    await page.waitForTimeout(1200)
  }
  return false
}

const govReady = async () => (await page.locator('[data-testid^="gov-doc-"]').count()) > 0

async function shot(name, url, opts = {}) {
  if (existsSync(`${OUT}/${name}.png`) && !process.env.FORCE) { console.log('skip(已有):', name); return }
  await goHash(url, opts.verify)
  await page.waitForTimeout(opts.wait ?? 4000)
  await dismissOverlays()
  if (opts.after) await opts.after()
  await page.screenshot({ path: `${OUT}/${name}.png` })
  const probe = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 80))
  console.log('shot:', name, '|', probe)
}

// ── 治理中心：总览 + 工件详情位（kinds 对齐 governance-controller GOVERNANCE_DOCS）──
await shot('ui-gov-center', '/app/board?tab=gov-docs', { wait: 6500, verify: govReady })  // 治理中心正身=看板 gov-docs tab（/app/gov 别名落 gov-org 无工件库钮）

const DOCS = [
  ['ui-gov-roster', 'roster', '账号清单'],
  ['ui-gov-appregistry', 'app-registry', '应用资产'],
  ['ui-gov-org', 'org', '组织与权限'],
  ['ui-gov-doc', 'freeze', 'G1 需求冻'],
  ['ui-gov-tasklist', 'tasklist', 'SMART'],
  ['ui-gov-design', 'design', '概要设计'],
  ['ui-gov-schedule', 'schedule', '排期'],
  ['ui-gov-test', 'test', '测试报告'],
  ['ui-gov-release', 'release', '发布说明'],
  ['ui-gov-uat', 'uat', 'UAT'],
  ['ui-gov-audit', 'audit', '审计'],
  ['ui-gov-retro', 'retro', '复盘'],
  ['ui-gov-tlpaycore', 'testlog-paycore', 'G3 证据'],
  ['ui-gov-tlchwx', 'testlog-chwx', 'G3 证据'],
  ['ui-gov-tlchali', 'testlog-chali', 'G3 证据'],
  ['ui-gov-tlmp', 'testlog-mp', 'G3 证据'],
]
for (const [name, kind, titleFrag] of DOCS) {
  if (existsSync(`${OUT}/${name}.png`) && !process.env.FORCE) { console.log('skip(已有):', name); continue }
  await goHash('/app/board?tab=gov-docs', govReady)
  await dismissOverlays()
  let ok = false
  for (let attempt = 0; attempt < 2 && !ok; attempt++) {
    const btn = page.locator(`[data-testid="gov-doc-${kind}"]`)
    if (await btn.count() === 0) { console.log('  [warn]', name, `gov-doc-${kind} 不存在(try${attempt})`); await page.waitForTimeout(1500); continue }
    await btn.first().scrollIntoViewIfNeeded().catch(() => {})
    await btn.first().click().catch((e) => console.log('  [warn]', name, e.message))
    ok = await page.locator('.gov-docs__docview-hd b', { hasText: titleFrag }).first()
      .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
    if (!ok) console.log('  [warn]', name, `详情头未含 "${titleFrag}"(try${attempt})`)
  }
  if (!ok) { console.log('  [FAIL]', name, '未通过头校验，不截（防错图入库）'); continue }
  await page.waitForTimeout(1200)
  await dismissOverlays()
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot:', name, '（头校验过）')
}

// ── 看板：切换器 / 等您操作 / 主卡抽屉 / G5 评审卡抽屉 ──
async function openBoard(slug) {
  await shot('ui-10-kanban', `/hermes/kanban?board=${slug}`, {
    wait: 4500,
    after: async () => {
      const sel = page.locator('text=/看板:.*Default/').first()
      if (await sel.isVisible().catch(() => false)) {
        await sel.click().catch(() => {})
        await page.waitForTimeout(600)
        const opt = page.locator(`text=${slug}`).first()
        if (await opt.isVisible().catch(() => false)) { await opt.click().catch(() => {}); await page.waitForTimeout(2200) }
      }
    },
  })
}

// ui-02-profiles：板切换器展开（账号隔离的板可见性）
if (!existsSync(`${OUT}/ui-02-profiles.png`) || process.env.FORCE) {
  await goHash('/hermes/kanban?board=fanfan-pm-plan')
  await page.waitForTimeout(5000)
  await dismissOverlays()
  const sel = page.locator('text=/看板:/').first()
  if (await sel.isVisible().catch(() => false)) {
    await sel.click().catch(() => {})
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/ui-02-profiles.png` })
    console.log('shot: ui-02-profiles（看板切换器展开）')
    await page.keyboard.press('Escape').catch(() => {})
  } else {
    await page.screenshot({ path: `${OUT}/ui-02-profiles.png` })
    console.log('shot: ui-02-profiles（切换器未出，全景如实留档）')
  }
}

// ui-10b-kanban-mine：「等您操作」过滤
if (!existsSync(`${OUT}/ui-10b-kanban-mine.png`) || process.env.FORCE) {
  await goHash('/hermes/kanban?board=fanfan-pm-plan')
  await page.waitForTimeout(5000)
  await dismissOverlays()
  const mine = page.locator('[data-testid="filter-mine-only"]').first()
  if (await mine.isVisible().catch(() => false)) { await mine.click().catch(() => {}); await page.waitForTimeout(1500) }
  await page.screenshot({ path: `${OUT}/ui-10b-kanban-mine.png` })
  console.log('shot: ui-10b-kanban-mine')
}

// ui-10-carddrawer：fanfan-pm-plan 主卡（RFD-001）抽屉
if (!existsSync(`${OUT}/ui-10-carddrawer.png`) || process.env.FORCE) {
  await goHash('/hermes/kanban?board=fanfan-pm-plan')
  await page.waitForTimeout(5000)
  await dismissOverlays()
  // 开抽屉门禁（run7 预检实锤：旧标题模式只匹配 run6 卡名，找不到卡→不点→光板与
  // kanban-mine 同帧 md5 重复）：按 /RFD-001/ 逐候选点开，.task-drawer 出现才算开；
  // 开不出即 DEFECT 拒拍，禁回退拍光板。
  let drawerOk = false
  for (let i = 0; i < 3 && !drawerOk; i++) {
    const card = page.locator('text=/RFD-001/').nth(i)
    if (!(await card.isVisible().catch(() => false))) break
    await card.scrollIntoViewIfNeeded().catch(() => {})
    await card.click().catch(() => {})
    // 抽屉根 .task-drawer 是 v-else-if="task && detail"——详情异步加载完才渲染，
    // 固定短等待即查属假阴性（run7 预检实锤）；waitFor 自动轮询至详情就绪。
    drawerOk = await page.locator('.task-drawer').first()
      .waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false)
  }
  if (drawerOk) {
    await page.screenshot({ path: `${OUT}/ui-10-carddrawer.png` })
    console.log('shot: ui-10-carddrawer（抽屉校验过）')
  } else {
    console.error('DEFECT[shutter-gate]: ui-10-carddrawer 抽屉未开——拒拍（禁光板顶替）')
  }
}

// ui-g5-carddrawer：fanfan-review 板 G5 评审卡 t_ea68c462 抽屉（review-record r7 头部）
if (!existsSync(`${OUT}/ui-g5-carddrawer.png`) || process.env.FORCE) {
  // G5 评审卡在 swarm 看板（旧 #/hermes/kanban 路由参数被无视落 Default 板——run7 补拍实锤）
  await page.evaluate(() => {
    localStorage.setItem('hermes.kanban.selectedBoard', 'fanfan-review')
    location.hash = '#/app/board'
  })
  await page.waitForTimeout(5000)
  await dismissOverlays()
  let drawerOk = false
  for (let attempt = 0; attempt < 2 && !drawerOk; attempt++) {
    // 卡号按轮取（旧写死 t_ea68c462 是 run2 卡，任何新轮必打不开）：state card_g5_ready
    // 优先，缺省按 G5 评审卡标题找；开启判据=.task-drawer 出现且卡面含准出评审字样。
    const g5id = state.card_g5_ready || state.card_g5 || ''
    const card = page.locator('.kanban-task-card').filter({ hasText: /发布准出评审|/ }).first()
    const card2 = g5id ? page.locator('.kanban-task-card').filter({ hasText: g5id }).first() : card
    const target = (await card2.count().catch(() => 0)) ? card2 : card
    if (await target.isVisible().catch(() => false)) {
      await target.scrollIntoViewIfNeeded().catch(() => {})
      await target.click().catch(() => {})
    }
    drawerOk = await page.locator('.task-drawer').first()
      .waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false)
    drawerOk = drawerOk && (await page.locator('text=/发布准出评审/').last().isVisible().catch(() => false))
  }
  if (drawerOk) {
    await page.screenshot({ path: `${OUT}/ui-g5-carddrawer.png` })
    console.log('shot: ui-g5-carddrawer（抽屉校验过）')
  } else {
    console.log('  [FAIL] ui-g5-carddrawer 抽屉未开，不截')
  }
}

// ── 本轮房间消息流全景（G2 结论行所在房间）──
if (!existsSync(`${OUT}/ui-room-archived.png`) || process.env.FORCE) {
  if (ROOM) await goHash(`/app/s/group/${encodeURIComponent(ROOM)}`)
  await page.waitForTimeout(9000)
  await dismissOverlays()
  if (!page.url().includes(ROOM.slice(0, 12))) {
    // 深链未选中房间时（run1 坑位）：在协作视图房间列表里点选同名房
    const items = page.locator('[data-testid*="room"] >> text=支付收银台需求分析讨论群')
    const n = await items.count().catch(() => 0)
    for (let i = 0; i < n; i++) {
      await items.nth(i).click({ timeout: 6000 }).catch(() => {})
      await page.waitForTimeout(5500)
      if (!ROOM || page.url().includes(ROOM.slice(0, 12))) break
    }
  }
  await page.waitForTimeout(2500)
  const roomOk = page.url().includes(ROOM.slice(0, 12))
  if (roomOk) {
    await page.screenshot({ path: `${OUT}/ui-room-archived.png` })
    console.log('shot: ui-room-archived（房间校验过，url=', page.url(), ')')
  } else {
    console.log('  [FAIL] ui-room-archived 房间未进视图（url=', page.url(), '），不截')
  }
}

await browser.close()
console.log('capture-run2-sup done →', OUT)
