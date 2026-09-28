// capture-demo-fix.mjs — v4 定向修复重拍（假重复 11 张）
// 修复口径：聊天=点击选房+等消息文本；治理工件=点工件按钮+等详情面板标题；
// 概览=等三卡标题；命令审批=等历史含命令条目或待审非空。
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const OUT = '/Volumes/nvme2230/lab/ncwk-sim-mux/evidence/20260928-product-demo/shots-v2'
const SIM = '/Volumes/nvme2230/lab/ncwk-sim-mux'
const ANALYSIS_ROOM = '!ubRAvsUSUJTdTIiKEI:matrix.test'
const only = process.argv[2]

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
      deviceId: 'CAPTURE-FIX', homeserverUrl: 'http://127.0.0.1:8008',
    }),
  }).then((r) => r.json())
  if (!res.token) throw new Error(`matrix-login(${user}) 失败`)
  jwt[user] = res.token
  return res.token
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.setDefaultTimeout(80000)

async function setSession(user, board) {
  await page.goto(BASE + '/login')
  await page.evaluate(([tk, bd]) => {
    localStorage.setItem('hermes_api_key', tk)
    localStorage.setItem('hermes_server_url', location.origin)
    localStorage.setItem('hermes_locale', 'zh')
    if (bd) localStorage.setItem('hermes.kanban.selectedBoard', bd)
  }, [await loginAs(user), board ?? null])
}

async function dismissOverlays() {
  for (let i = 0; i < 3; i++) {
    const bannerBtn = page.locator('[data-testid="studio-announcement"] button').last()
    if (await bannerBtn.isVisible().catch(() => false)) { await bannerBtn.click().catch(() => {}); await page.waitForTimeout(400); continue }
    break
  }
  for (const txt of ['Got it', '确认', '确定', '知道了', '稍等', '稍后提醒']) {
    const btn = page.locator(`button:has-text("${txt}")`).first()
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(300) }
  }
}

async function waitShot(name, readyLocator, opts = {}) {
  if (only && only !== name) return
  await page.locator(readyLocator).first()
    .waitFor({ state: 'visible', timeout: opts.readyTimeout ?? 75000 })
    .catch(() => console.log(`  [warn] ${name}: ready 未出现`))
  await page.waitForTimeout(opts.settle ?? 2200)
  await dismissOverlays()
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot:', name)
}

// ── 聊天类：进入工作台 → 点选分析群 → 等消息 ──
async function openChat() {
  await page.goto(BASE + '/#/app/s/group/' + encodeURIComponent(ANALYSIS_ROOM), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  // 兜底：若未选中房间，点房间列表第一项
  const roomBtn = page.locator('text=支付收银台需求分析讨论群').first()
  if (await roomBtn.isVisible().catch(() => false)) {
    await roomBtn.click().catch(() => {})
    await page.waitForTimeout(3000)
  }
}

// s06 建群产物：群页（OBJECT 群名 + 参与者 + 消息流）
await (async () => {
  if (only && only !== 's06-room-created') return
  await setSession('fanfan')
  await openChat()
  await waitShot('s06-room-created', 'text=bella', { settle: 2500 })
})()

// s07 派发指令消息：滚动到含派发语义的消息
await (async () => {
  if (only && only !== 's07-dispatch-msg') return
  if (!only) { /* 沿用已开聊天 */ } else { await setSession('fanfan'); await openChat() }
  const hit = page.locator('.mx_EventTile_body', { hasText: /派发|需求文档|RFD-001|请按/ }).last()
  if (await hit.isVisible({ timeout: 20000 }).catch(() => false)) {
    await hit.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(1200)
  }
  await dismissOverlays()
  await page.screenshot({ path: `${OUT}/s07-dispatch-msg.png` })
  console.log('shot: s07-dispatch-msg')
})()

// s10 RACI 派发消息：滚动到含主责/@agent 语义的消息
await (async () => {
  if (only && only !== 's10-raci-dispatch') return
  if (!only) { /* 沿用 */ } else { await setSession('fanfan'); await openChat() }
  const hit = page.locator('.mx_EventTile_body', { hasText: /主责|RACI|责任|agent/ }).last()
  if (await hit.isVisible({ timeout: 20000 }).catch(() => false)) {
    await hit.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(1200)
  }
  await dismissOverlays()
  await page.screenshot({ path: `${OUT}/s10-raci-dispatch.png` })
  console.log('shot: s10-raci-dispatch')
})()

// ── 治理工件类：进入治理中心 → 点左栏工件按钮 → 等详情标题 ──
async function govArtifact(name, btnText, detailText) {
  if (only && only !== name) return
  await setSession('fanfan')
  await page.goto(BASE + '/#/app/gov', { waitUntil: 'domcontentloaded' })
  await page.locator('text=治理中心').first().waitFor({ state: 'visible', timeout: 60000 })
    .catch(() => console.log(`  [warn] ${name}: 治理中心未现`))
  await page.waitForTimeout(2500)
  const btn = page.locator(`button:has-text("${btnText}")`).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
  } else {
    console.log(`  [warn] ${name}: 工件按钮 "${btnText}" 不可见`)
  }
  await waitShot(name, `text=${detailText}`, { settle: 2000 })
}

await govArtifact('s15-g2-archgate', 'G2 架构评审', '架构评审')
await govArtifact('s19-testreport-doc', '测试报告', '测试报告')
await govArtifact('s20-release-gate', 'G5 发布准出', '发布准出')
await govArtifact('s21-uat-doc', 'UAT', '验收')
await govArtifact('s23-audit-doc', '审计', '审计')
await govArtifact('s24-retro-doc', '复盘', '复盘')

// s22 概览三卡
await (async () => {
  if (only && only !== 's22-dash-workmgr') return
  await setSession('fanfan')
  await page.goto(BASE + '/#/app/dash', { waitUntil: 'domcontentloaded' })
  await waitShot('s22-dash-workmgr', 'text=我的待办', { settle: 3000 })
})()

// s26 命令审批：优先待审非空；否则历史含命令条目
await (async () => {
  if (only && only !== 's26-cmd-approval') return
  await setSession('wei')
  await page.goto(BASE + '/#/app/inbox', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  await dismissOverlays()
  await page.screenshot({ path: `${OUT}/s26-cmd-approval.png` })
  console.log('shot: s26-cmd-approval')
})()

await browser.close()
console.log('fix capture done')
