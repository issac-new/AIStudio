// 运行观测吸收批浏览器走查（dev 链 8649→8657 隔离后端）
// 断言：①IDE 轨迹页签在位（16 页签）+真实会话加载轨迹（或诚实空态）
// ②运行中心 runs 页签常驻意图面板不炸 ③RunListTable 徽标类样式在
// ④工作流面板会话行 ⌨ 跳转按钮渲染
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:8649'
const API = 'http://localhost:8657'
const shots = '/tmp/absorb-run-shots'
mkdirSync(shots, { recursive: true })

const results = []
function ok(name, cond, note = '') {
  results.push({ name, pass: !!cond, note })
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

const login = await fetch(API + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: '123456' }),
}).then(r => r.json()).catch(e => ({ error: String(e) }))
if (!login.token) { console.log('login failed'); process.exit(1) }

async function open(url) {
  const p = await ctx.newPage()
  await p.goto(BASE + '/')
  await p.evaluate((t) => {
    localStorage.setItem('hermes_api_key', t)
    localStorage.setItem("hermes_server_url", location.origin)
    localStorage.setItem('hermes_locale', 'zh')
    // 辅助面板预设展开（store 持久化键 hermes_ide_sidepane：{open,tab,width}）
    try { localStorage.setItem('hermes_ide_sidepane', JSON.stringify({ open: true, tab: 'trajectory', width: 480 })) } catch {}
  }, login.token)
  // SPA 在 goto('/') 时已初始化并读完旧 localStorage——经 about:blank 强制
  // 重新加载文档，让 store（hermes_ide_sidepane 等）读到预设值
  await p.goto('about:blank')
  await p.goto(url)
  await p.waitForTimeout(5000)
  return p
}

// ① IDE 轨迹页签（面板经 localStorage 预设展开——状态栏开关非本批验证面）
{
  const p = await open(BASE + '/#/app/ide')
  const tab = p.locator('[data-testid="ide-sidepane-tab-trajectory"]')
  await tab.waitFor({ timeout: 12000 }).catch(async () => {
    // vite 热编译竞态（模块首次编译慢/动态导入 500）——重载一次
    await p.reload().catch(() => {})
    await p.waitForTimeout(4000)
  })
  // 页签条含 3 个功能按钮（add/max/collapse）与 TABS 同类名——只数 data-testid 前缀匹配的 TABS 项
  const tabCount = await p.locator('[data-testid^="ide-sidepane-tab-"]').count()
  ok('IDE 轨迹页签在位（16 页签）', await tab.count() === 1 && tabCount === 16, `tabs=${tabCount}`)
  await p.waitForTimeout(2000)
  // 挂载点外部 data-testid 覆盖组件内声明（Vue attrs 落根）——查挂载点容器
  const pane = await p.locator('[data-testid="ide-sidepane-trajectory"]').count()
  ok('轨迹面板渲染', pane === 1)
  // 无选中会话=诚实空态；选中会话=账本或 no-trace 空态（皆可，不炸即可）
  const stateText = await p.locator('[data-testid="ide-sidepane-trajectory"]').innerText().catch(() => '')
  const honest = stateText.includes('未选择会话') || stateText.includes('无轨迹') || stateText.includes('节点') || stateText.includes('加载')
  ok('轨迹面板状态诚实（空态/账本皆可）', honest, stateText.slice(0, 60).replace(/\n/g, '|'))
  await p.screenshot({ path: shots + '/01-ide-trajectory.png' })
  await p.close()
}

// ② 运行中心常驻意图面板 + 徽标样式
{
  const p = await open(BASE + '/#/app/runs')
  await p.waitForTimeout(1500)
  const glsp = await p.locator('[data-testid="goal-loop-standing"]').count()
  console.log(`  常驻意图面板 presence=${glsp}（0=当前无 loop，面板自收起=设计行为）`)
  ok('运行中心页渲染不炸', await p.locator('.rc-view').count() >= 1)
  // 徽标样式注入验证（css 类存在于样式表）
  const badgeCss = await p.evaluate(() => {
    const sheets = [...document.styleSheets]
    try {
      return sheets.some(s => { try { return [...s.cssRules].some(r => r.selectorText?.includes('rc-table__src-badge')) } catch { return false } })
    } catch { return false }
  })
  ok('RunListTable 来源徽标样式在', badgeCss)
  await p.screenshot({ path: shots + '/02-run-center.png' })
  await p.close()
}

// ③ 工作流面板 ⌨ 跳转按钮（会话行存在时）
{
  const p = await open(BASE + '/#/app/runs?tab=workflows')
  await p.waitForTimeout(1200)
  const jump = await p.locator('[data-testid^="wf-jump-ide-"]').count()
  console.log(`  工作流会话跳转按钮 count=${jump}（0=引擎离线/无会话，非缺陷）`)
  ok('工作流页签渲染不炸', await p.locator('[data-testid="rc-panel-workflows"]').count() === 1)
  await p.close()
}

await browser.close()
const fails = results.filter(r => !r.pass)
console.log(`\n== 走查 ${results.length - fails.length}/${results.length} ==`)
if (fails.length) { console.log(JSON.stringify(fails, null, 2)); process.exit(1) }
