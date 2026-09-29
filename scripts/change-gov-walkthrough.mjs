// 变更治理 + 管理三账走查（隔离链 8659→8657，调研落地轮 2026-09-29）：
//   ① 看板第三页签「管理三账」：三账卡 + 决策点表渲染（真实聚合数据或诚实空态）
//   ② 治理中心变更治理区：管控基准 6 格 + 冻结窗口 + 变更单表
//   ③ 实弹闭环：新建变更单（创建并提交）→ 行出现 + SLA 剩余显示
//   ④ 冻结闸门：建三级窗口 → 窗口期内再提一单 → 冻结穿透 chip + override 勾选框
//   ⑤ 指标实绩回灌（月新增 ≥2）
// 环境配方（均已在本轮实证）：
//   - 隔离上游：OVERLAY_UPSTREAM_ROOT=<私有注入副本>；后端 8657（启动器文件注入 env，
//     rtk hook 会吞命令行 env 前缀）；前端 vite 8659
//   - hash 路由：入口必须 /#/（直连 /app/* 落空）
//   - 系统浏览器：channel:'chrome'（隔离链 playwright 浏览器未下载）
//   - naive-ui 遮罩：跨 hash 导航残留弹窗拦点击——clearMasks（Escape×3）
//   - 复用表单场景：第二次开表单前整页 reload（组件内 showForm 状态残留会让点击失灵）
// 用法：node scripts/change-gov-walkthrough.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = process.env.WALK_BASE || 'http://localhost:8659'
const shots = process.env.WALK_SHOTS || '/tmp/change-gov-shots'
mkdirSync(shots, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, locale: 'zh-CN' })
const results = []
function record(name, ok, note = '') { results.push({ name, ok, note }) }

async function clearMasks() {
  for (let i = 0; i < 3 && await page.locator('.n-modal-mask').count() > 0; i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}

// dev 链路 localhost 自动登录；等落地
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

// ── ① 管理三账页签 ──
await page.goto(BASE + '/#/app/board?tab=accounts', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
record('三账页签按钮（507 词条）', await page.locator('[data-testid="ia-tasks-tab-accounts"]').count() > 0)
record('三账面板渲染', await page.locator('[data-testid="ma-panel"]').count() > 0)
record('进度偏差账卡', await page.locator('[data-testid="ma-progress"]').count() > 0)
record('风险分布账卡', await page.locator('[data-testid="ma-risk"]').count() > 0)
record('资源结构账卡', await page.locator('[data-testid="ma-resource"]').count() > 0)
const hasData = await page.locator('[data-testid="ma-decisions"]').count() > 0
const emptyState = await page.locator('[data-testid="ma-empty"]').count() > 0
record('三账数据面（有数据或诚实空态）', hasData || emptyState, hasData ? '决策点表在' : '空态（聚合端点无任务）')
await page.screenshot({ path: `${shots}/01-accounts-tab.png`, fullPage: false })

// 决策点动线：定位 → 看板页签
const locateBtn = page.locator('[data-testid="ma-decisions"] button', { hasText: '定位' }).first()
if (await locateBtn.count() > 0) {
  await locateBtn.click()
  await page.waitForTimeout(600)
  const boardActive = await page.locator('[data-testid="ia-tasks-tab-board"]').first().getAttribute('aria-selected')
  record('决策点定位 → 看板页签', boardActive === 'true')
}

// ── ② 治理中心变更治理区（整页重进：清组件态 + 遮罩）──
await page.goto(BASE + '/#/app/gov', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await clearMasks()
record('变更治理区挂载', await page.locator('[data-testid="gov-change-section"]').count() > 0)
for (const k of ['monthlyNew', 'emergencyRatio', 'overdueReview', 'reworkHours', 'freezePenetration', 'firstPassRate']) {
  record(`管控基准格 ${k}`, await page.locator(`[data-testid="cg-metric-${k}"]`).count() > 0)
}
record('冻结窗口块', await page.locator('[data-testid="cg-freeze-new"]').count() > 0)
await page.screenshot({ path: `${shots}/02-gov-change.png`, fullPage: false })

// ── ③ 实弹闭环：创建并提交一单 ──
await clearMasks()
await page.locator('[data-testid="cg-new"]').first().click()
await page.waitForTimeout(800)
await page.locator('[data-testid="cg-form-title"]').fill('走查：报表字段新增（E2E）')
await page.locator('[data-testid="cg-form-source"]').fill('walkthrough')
await page.locator('[data-testid="cg-form-impact-schedule"]').selectOption('2')
await page.locator('[data-testid="cg-form-impact-risk"]').selectOption('2')
await page.locator('[data-testid="cg-form-create-submit"]').click()
await page.waitForTimeout(1200)
const row1 = page.locator('[data-testid^="cg-row-cr-"]', { hasText: '走查：报表字段新增' })
record('变更单创建并提交（行出现）', await row1.count() > 0)
record('评审中 SLA 剩余显示', (await row1.first().innerText().catch(() => '')).includes('剩'))
await page.screenshot({ path: `${shots}/03-change-created.png`, fullPage: false })

// ── ④ 冻结闸门：建窗口 → 再提一单 → 穿透 chip（表单二开前整页 reload，清组件态）──
await clearMasks()
await page.locator('[data-testid="cg-freeze-new"]').first().click()
await page.waitForTimeout(800)
await page.locator('[data-testid="cg-freeze-name"]').fill('走查：v0.9 发布冻结')
await page.locator('[data-testid="cg-freeze-tier"]').selectOption('3')
const now = new Date()
const fmt = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
await page.locator('[data-testid="cg-freeze-start"]').fill(fmt(new Date(now.getTime() - 3600_000)))
await page.locator('[data-testid="cg-freeze-end"]').fill(fmt(new Date(now.getTime() + 72 * 3600_000)))
await page.locator('[data-testid="cg-freeze-create"]').click()
await page.waitForTimeout(1200)
record('冻结窗口创建（T3 行出现）', await page.locator('[data-testid^="cg-freeze-row-fw-"]', { hasText: '走查：v0.9 发布冻结' }).count() > 0)

await page.goto(BASE + '/#/app/gov', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await clearMasks()
await page.locator('[data-testid="cg-new"]').first().click()
await page.waitForTimeout(800)
await page.locator('[data-testid="cg-form-title"]').fill('走查：冻结期插单（E2E）')
await page.locator('[data-testid="cg-form-impact-scope"]').selectOption('1')
await page.locator('[data-testid="cg-form-create-submit"]').click()
await page.waitForTimeout(1200)
const row2 = page.locator('[data-testid^="cg-row-cr-"]', { hasText: '走查：冻结期插单' })
const row2Text = await row2.first().innerText().catch(() => '')
record('冻结期提交标穿透 chip', row2Text.includes('冻结穿透'), row2Text.slice(0, 80))
record('穿透单渲染 override 勾选框', await row2.locator('text=裁决穿透冻结窗口').count() > 0)
await page.screenshot({ path: `${shots}/04-freeze-gate.png`, fullPage: false })

// ── ⑤ 指标实绩回灌 ──
const monthly = await page.locator('[data-testid="cg-metric-monthlyNew"]').innerText()
record('月新增指标实绩 ≥2（实弹数据回灌）', /([2-9]|\d{2,})/.test((monthly.split('\n')[1] || '')), monthly.replace(/\n/g, ' '))
await page.screenshot({ path: `${shots}/05-metrics.png`, fullPage: false })

await browser.close()
console.table(results)
const fails = results.filter(r => !r.ok)
console.log(`PASS ${results.length - fails.length}/${results.length}`)
process.exit(fails.length ? 1 : 0)
