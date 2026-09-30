// 运行面融合批走查（8649）：日程还原 + 运行中心工作流页签 + 看板全链路追踪页签
// 全断言显式 waitFor（vite 按需编译时序抖动，固定 sleep 不可靠）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:8649'
const shots = '/tmp/run-surface-fusion-shots'
mkdirSync(shots, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
await page.addInitScript(() => {
  try { localStorage.setItem('hermes_ide_sidepane', JSON.stringify({ open: true, tab: 'workflow', width: 340 })) } catch {}
})
const results = []
function record(name, ok, note = '') { results.push({ name, ok, note }) }
async function waitSel(sel, timeout = 15000) {
  try { await page.waitForSelector(sel, { timeout }); return true } catch { return false }
}

await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250) }
await page.evaluate(() => { document.querySelectorAll('.n-modal-mask, .n-modal-container').forEach(e => e.remove()) })

// ① 沟通协作壳：日程按钮还原 + 弹窗开合
const schedOk = await waitSel('[data-testid="ia-header-schedule"]', 20000)
record('① /app 页头日程按钮还原', schedOk)
if (schedOk) {
  await page.locator('[data-testid="ia-header-schedule"]').first().evaluate(el => el.click())
  const modalOk = await waitSel('.cockpit-schedule-modal', 8000)
  record('① 日程弹窗打开', modalOk)
  await page.screenshot({ path: `${shots}/01-schedule-modal.png` })
  if (modalOk) {
    await page.locator('.ia-overlay').first().evaluate(el => el.click()).catch(() => {})
    await page.waitForTimeout(400)
  }
}
await page.screenshot({ path: `${shots}/02-app-header.png` })

// ② 运行中心：工作流第四页签 + 深链
await page.goto(BASE + '/#/app/runs', { waitUntil: 'domcontentloaded' })
const wfTabOk = await waitSel('[data-testid="rc-tab-workflows"]', 20000)
record('② 运行中心工作流页签', wfTabOk)
if (wfTabOk) {
  const wfText = (await page.locator('[data-testid="rc-tab-workflows"]').first().textContent()) || ''
  record('② 页签文案=工作流', wfText.includes('工作流') || wfText.includes('Workflows'), wfText.trim())
  await page.locator('[data-testid="rc-tab-workflows"]').first().evaluate(el => el.click())
  const panelOk = await waitSel('[data-testid="workflow-observation-panel"]', 10000)
  record('② 工作流面板挂载', panelOk)
  await page.screenshot({ path: `${shots}/03-runcenter-workflows.png` })
  await page.goto(BASE + '/#/app/runs?tab=workflows', { waitUntil: 'domcontentloaded' })
  record('② ?tab=workflows 深链直达', await waitSel('[data-testid="workflow-observation-panel"]', 15000))
}

// ③ 看板：全链路追踪页签
await page.goto(BASE + '/#/app/board', { waitUntil: 'domcontentloaded' })
const obsTabOk = await waitSel('[data-testid="ia-tasks-tab-observatory"]', 20000)
record('③ 看板全链路追踪页签', obsTabOk)
if (obsTabOk) {
  const obsText = (await page.locator('[data-testid="ia-tasks-tab-observatory"]').first().textContent()) || ''
  record('③ 页签文案=全链路追踪', obsText.includes('全链路追踪') || obsText.includes('Observatory'), obsText.trim())
  await page.locator('[data-testid="ia-tasks-tab-observatory"]').first().evaluate(el => el.click())
  const rtoOk = await waitSel('[data-testid="ia-tasks-panel-observatory"] .run-trace-overview', 15000)
  record('③ RunTraceOverview 面板挂载', rtoOk)
  await page.screenshot({ path: `${shots}/04-board-observatory.png` })
}

// ④ IDE 壳：⟐ 工作流面板薄壳 + 日程（共享页头）
await page.goto(BASE + '/#/app/ide', { waitUntil: 'domcontentloaded' })
const ideShellOk = await waitSel('[data-testid="ide-sidepane"]', 25000)
record('④ IdeShell 渲染（ide-sidepane 挂载）', ideShellOk)
const ideWfTabOk = await waitSel('[data-testid="ide-sidepane-tab-workflow"]', 10000)
record('④ IDE 侧栏 ⟐ 页签', ideWfTabOk)
if (ideWfTabOk) {
  await page.locator('[data-testid="ide-sidepane-tab-workflow"]').first().evaluate(el => el.click())
  const paneOk = await waitSel('[data-testid="ide-sidepane-workflow"]', 10000)
  record('④ IDE 工作流面板（共享组件薄壳）', paneOk)
  await page.screenshot({ path: `${shots}/05-ide-workflow-pane.png` })
}
const ideSchedOk = await waitSel('[data-testid="ia-header-schedule"]', 10000)
record('④ IDE 壳日程按钮（共享页头）', ideSchedOk)
if (ideSchedOk) {
  await page.locator('[data-testid="ia-header-schedule"]').first().evaluate(el => el.click())
  record('④ IDE 壳日程弹窗打开', await waitSel('.cockpit-schedule-modal', 8000))
  await page.screenshot({ path: `${shots}/06-ide-schedule-modal.png` })
}

await browser.close()

const pass = results.filter(r => r.ok).length
console.log(`\n===== 走查结果 ${pass}/${results.length} =====`)
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? '  (' + r.note + ')' : ''}`)
process.exit(pass === results.length ? 0 : 1)
