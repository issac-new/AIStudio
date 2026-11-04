// 运行面融合批走查（8649）：日程还原 + 运行中心深链 + 看板效益页签 + IDE 工作流面板
// 全断言显式 waitFor（vite 按需编译时序抖动，固定 sleep 不可靠）
// 2026-11-04 r26 清偿：①results 曾声明在 try 块内、汇总在块外——ReferenceError 崩溃
// ②rc-tab-workflows 旧运行中心页签已随 0d44031ee 死件删除收敛→改 /app/runs 深链断言
// ③ia-tasks-tab-observatory→ia-tasks-tab-effectiveness（TasksView 四页签重构现名）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:8649'
const shots = '/tmp/run-surface-fusion-shots'
mkdirSync(shots, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
// page/results 提到 try 外：results 曾在 try 内声明、finally 后汇总引用——块级作用域
// ReferenceError（2026-11-04 r26 回归实录），任何路径都要能走到汇总。
const results = []
function record(name, ok, note = '') { results.push({ name, ok, note }) }
// try/finally 保证中途异常也关浏览器：曾无兜底，任一断言抛错即泄漏 Chrome 子进程
try {
const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
await page.addInitScript(() => {
  try { localStorage.setItem('hermes_ide_sidepane', JSON.stringify({ open: true, tab: 'workflow', width: 340 })) } catch {}
})
async function waitSel(sel, timeout = 15000) {
  try { await page.waitForSelector(sel, { timeout }); return true } catch { return false }
}

// 落地直进 ia2 壳（#/# 落地可能在登录页/hermes 旧壳——日程按钮在 ia2 壳页头，
// r26 清偿实录：旧起点 goto #/ 等 ia-header-schedule 超时假红，02 截图 17.6K 空页）
await page.goto(BASE + '/#/app', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="ia-shell-header"]', { timeout: 30000 })
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

// ② 运行中心：/app/runs 深链可达（旧 rc-tab-workflows 页签面已随 0d44031ee 收敛删除）
await page.goto(BASE + '/#/app/runs', { waitUntil: 'domcontentloaded' })
const runsOk = await waitSel('.ia-shell, [data-testid="ia-shell-header"]', 20000)
record('② /app/runs 深链可达（收敛后入口）', runsOk)
await page.screenshot({ path: `${shots}/03-runcenter.png` })

// ③ 看板：效益页签（原「全链路追踪」observatory 页签重构并入 effectiveness）
await page.goto(BASE + '/#/app/board', { waitUntil: 'domcontentloaded' })
const obsTabOk = await waitSel('[data-testid="ia-tasks-tab-effectiveness"]', 20000)
record('③ 看板效益页签', obsTabOk)
if (obsTabOk) {
  await page.locator('[data-testid="ia-tasks-tab-effectiveness"]').first().evaluate(el => el.click())
  const panelOk = await waitSel('[data-testid="ia-tasks-panel-effectiveness"]', 15000)
  record('③ 效益面板挂载', panelOk)
  await page.screenshot({ path: `${shots}/04-board-effectiveness.png` })
}

// ④ IDE 壳：⟐ 工作流面板薄壳 + 日程（共享页头）
await page.goto(BASE + '/#/app/ide', { waitUntil: 'domcontentloaded' })
const ideShellOk = await waitSel('[data-testid="ide-sidepane"]', 25000)
record('④ IdeShell 渲染（ide-sidepane 挂载）', ideShellOk)
// 侧栏页签按组过滤渲染（groupFilter 持久化，默认可能非 observe 组）——真实用户
// 路径=点 observe 组露出 workflow 页签；直接等 tab 会在 code 组下假红（r26 实录）。
let ideWfTabOk = false
if (ideShellOk) {
  await page.locator('[data-testid="ide-sidepane-group-observe"]').first().evaluate(el => el.click()).catch(() => {})
  ideWfTabOk = await waitSel('[data-testid="ide-sidepane-tab-workflow"]', 20000)
}
record('④ IDE 侧栏 ⟐ 页签（observe 组）', ideWfTabOk)
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

} catch (e) {
  console.error('[walkthrough] 中途异常，已保留已完成断言：', e?.message || e)
  process.exitCode = 1
} finally {
  await browser.close().catch(() => {})
}

const pass = results.filter(r => r.ok).length
console.log(`\n===== 走查结果 ${pass}/${results.length} =====`)
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? '  (' + r.note + ')' : ''}`)
process.exit(pass === results.length ? 0 : 1)
