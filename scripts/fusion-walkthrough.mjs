// 融合批走查（隔离链 8649）：关键 testid 断言 + 截图
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:8649'
const shots = '/tmp/fusion-shots'
import { mkdirSync } from 'fs'
mkdirSync(shots, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
const results = []
function record(name, ok, note = '') { results.push({ name, ok, note }) }

// 等 AutoLogin 落地
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

// ① /ide 壳与新头部按钮
await page.goto(BASE + '/ide', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
for (const tid of ['ide-chat-video-frames', 'ide-chat-find', 'ide-chat-btw', 'ide-chat-bgtasks', 'ide-chat-sidesession']) {
  const ok = await page.locator(`[data-testid="${tid}"]`).count() > 0
  record(`ide 头部 ${tid}`, ok)
}
await page.screenshot({ path: `${shots}/01-ide-head.png` })

// ② 右栏 slash 页签（patch 501 词条真上屏）
const slashTab = await page.locator('[data-testid="ide-sidepane-tab-slash"]').count() > 0
record('右栏 slash 页签（501 词条）', slashTab)
if (slashTab) {
  await page.locator('[data-testid="ide-sidepane-tab-slash"]').first().click()
  await page.waitForTimeout(600)
  const pane = await page.locator('[data-testid="ide-slash-pane"]').count() > 0
  record('slash 管理页签打开', pane)
  await page.screenshot({ path: `${shots}/02-slash-pane.png` })
}

// ③ B6 对照分屏开
const sideBtn = page.locator('[data-testid="ide-chat-sidesession"]')
if (await sideBtn.count() > 0) {
  await sideBtn.first().click()
  await page.waitForTimeout(800)
  record('对照分屏面板', await page.locator('[data-testid="ide-side-session"]').count() > 0)
  await page.screenshot({ path: `${shots}/03-side-session.png` })
  await sideBtn.first().click()
}

// ④ B1 后台任务中心
const bgBtn = page.locator('[data-testid="ide-chat-bgtasks"]')
if (await bgBtn.count() > 0) {
  await bgBtn.first().click()
  await page.waitForTimeout(1200)
  record('后台任务中心面板', await page.locator('[data-testid="ide-bgtasks"]').count() > 0)
  await page.screenshot({ path: `${shots}/04-bg-tasks.png` })
}

// ⑤ A10 全屏 Matrix 客户端路由
await page.goto(BASE + '/matrix', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const matrixView = await page.locator('.matrix-chat-view').count() > 0
record('/matrix 全屏客户端（A10）', matrixView)
await page.screenshot({ path: `${shots}/05-matrix-full.png` })

// ⑥ B9 通知偏好（/app 铃铛→消息页签→⚙）
await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
const bell = page.locator('[data-testid*="notify"], .ia-shell__bell, [class*="bell"]').first()
let prefOk = false
const toggles = page.locator('[data-testid="notify-prefs-toggle"]')
if (await toggles.count() > 0) {
  await toggles.first().click()
  await page.waitForTimeout(500)
  prefOk = await page.locator('[data-testid="notify-pref-messages"]').count() > 0
}
record('B9 通知偏好区（需开消息页签）', prefOk, prefOk ? '' : '铃铛消息页签未在无通知态直达——见截图')
await page.screenshot({ path: `${shots}/06-app.png` })

await browser.close()
console.table(results)
const fails = results.filter(r => !r.ok)
console.log(`PASS ${results.length - fails.length}/${results.length}`)
process.exit(fails.length ? 1 : 0)
