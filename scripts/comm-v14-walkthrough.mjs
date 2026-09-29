// overlay/scripts/comm-v14-walkthrough.mjs
// v14 统一聊天 Phase 1 走查（隔离链 8649，与 fusion-walkthrough 同款约定：
// devAutoLogin 等 2.5s、testid 断言 + 截图 /tmp/v14-shots）。
// 前置：npm run dev 起在 8649（后端 8647 可达；inject 已含 patch 506/507/508）。
// 断言面：
//   ① 左栏单一「聊天」列表（三小节退役、kind 图标、行 testid 沿用）
//   ② 「＋新聊天」三分型菜单（agent 单聊/agent 群聊/matrix 房间内联输入）
//   ③ 中栏无内嵌侧栏：选中群聊后 .room-sidebar 不存在；选中会话后 .session-list
//      不存在（standaloneEmbed 生效——上游 patch 506/507 的真上屏验证）
//   ④ 群聊行 hover ✕（delete-group）
// 用法：node scripts/comm-v14-walkthrough.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = process.env.V14_BASE ?? 'http://localhost:8649'
const shots = '/tmp/v14-shots'
mkdirSync(shots, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
const results = []
function record(name, ok, note = '') { results.push({ name, ok, note }) }

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await page.screenshot({ path: `${shots}/01-app-workbench.png` })

// ① 单一聊天列表
record('单一「聊天」分节（flow-cluster-chat-all）', await page.locator('[data-testid="flow-cluster-chat-all"]').count() > 0)
record('旧三小节退役（flow-cluster-room 不存在）', await page.locator('[data-testid="flow-cluster-room"]').count() === 0)
record('行首 kind 图标（.flow-nav__kind）', await page.locator('.flow-nav__kind').count() > 0)

// ② 新聊天三分型菜单
const newBtn = page.locator('[data-testid="flow-new-session"]')
if (await newBtn.count() > 0) {
  await newBtn.first().click()
  await page.waitForTimeout(400)
  record('三分型菜单（flow-new-menu）', await page.locator('[data-testid="flow-new-menu"]').count() > 0)
  record('菜单项：agent 单聊/群聊/matrix 房间', (await page.locator('[data-testid="flow-new-chat-agent"]').count()) > 0
    && (await page.locator('[data-testid="flow-new-chat-group"]').count()) > 0
    && (await page.locator('[data-testid="flow-new-chat-room"]').count()) > 0)
  await page.screenshot({ path: `${shots}/02-new-chat-menu.png` })
  await page.keyboard.press('Escape')
} else {
  record('三分型菜单（flow-new-menu）', false, 'flow-new-session 按钮未找到（左栏未渲染？）')
}

// ③ 中栏内嵌侧栏消除（若有群聊/会话行可点）
const groupRow = page.locator('[data-kind="group"]').first()
if (await groupRow.count() > 0) {
  await groupRow.click()
  await page.waitForTimeout(2500)
  record('群聊画布无内嵌房间侧栏（.room-sidebar）', await page.locator('.room-sidebar').count() === 0)
  record('群聊行 ✕（delete-group）', await page.locator('[class*="flow-del-group"]').count() > 0)
  await page.screenshot({ path: `${shots}/03-group-nosidebar.png` })
} else {
  record('群聊画布无内嵌房间侧栏', false, '无群聊行可点（数据未就绪，人工复核）')
}
const chatRow = page.locator('[data-kind="chat"]').first()
if (await chatRow.count() > 0) {
  await chatRow.click()
  await page.waitForTimeout(2500)
  record('会话画布无内嵌会话侧栏（.session-list）', await page.locator('.session-list').count() === 0)
  await page.screenshot({ path: `${shots}/04-chat-nosidebar.png` })
} else {
  record('会话画布无内嵌会话侧栏（.session-list）', false, '无会话行可点（数据未就绪，人工复核）')
}

console.table(results)
const failed = results.filter(r => !r.ok)
await browser.close()
if (failed.length) { console.error(`FAIL ${failed.length}/${results.length}`); process.exit(1) }
console.log(`PASS ${results.length}/${results.length}`)
