// 驾舱聚焦轮 P9 浏览器走查（隔离链 8669→8667，私有注入上游）
// 断言：M2 侧栏一级仅驾驶舱+系统组 / /ide→/app/ide 重定向 / M6 /app/l→runs
//       /app/board 看板可达 / 运行详情空态不炸（loop 画布节隐藏）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:8669'
const API = 'http://localhost:8667'
const shots = '/tmp/cf-shots'
mkdirSync(shots, { recursive: true })


async function clearMasks() {
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(250) }
  await page.evaluate(() => document.querySelectorAll('.n-modal-mask').forEach(m => m.remove())).catch(() => {})
}

const results = []
function ok(name, cond, note = '') {
  results.push({ name, pass: !!cond, note })
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(BASE + '/')

// 登录：admin/123456（dev 链默认管理员）
const login = await fetch(API + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: '123456' }),
}).then(r => r.json()).catch(e => ({ error: String(e) }))
if (!login.token) { console.log('login failed:', JSON.stringify(login).slice(0, 200)); process.exit(1) }
await page.goto(BASE + '/#/app')
await page.evaluate(t => {
  localStorage.setItem('hermes_api_key', t)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, login.token)

// ① M2：主侧栏一级仅「驾驶舱」+系统折叠组（无 IDE 一级入口）
// cockpit/IDE 均 fullscreen 自带壳，侧栏只在系统页可见；同文档 hash 跳转会被
// 守卫弹回 /app（walkthrough 实测），故独立开新页从根导航
{
  const p2 = await ctx.newPage()
  await p2.goto(BASE + '/')
  await p2.evaluate(t => {
    localStorage.setItem('hermes_api_key', t)
    localStorage.setItem('hermes_server_url', location.origin)
    localStorage.setItem('hermes_locale', 'zh')
  }, login.token)
  await p2.goto(BASE + '/#/hermes/logs')
  await p2.waitForTimeout(6000)
  const sidebarText = await p2.locator('.sidebar-nav').innerText().catch(() => '')
  ok('M2 侧栏一级无 IDE 入口', !sidebarText.includes('IDE 工作台'), `nav="${sidebarText.slice(0, 60).replace(/\n/g, '|')}"`)
  ok('M2 侧栏一级有驾驶舱', sidebarText.includes('Cockpit') || sidebarText.includes('驾驶舱'), sidebarText.slice(0, 60))
  await p2.screenshot({ path: shots + '/01-sidebar-single-entry.png' })
  await p2.close()
}

// ② M2：/ide 旧链兼容重定向 → /app/ide，IDE 壳渲染
await page.goto(BASE + '/#/ide')
await page.waitForTimeout(6000)
ok('M2 /ide → /app/ide 重定向', page.url().includes('/#/app/ide'), page.url())
await page.screenshot({ path: shots + '/02-app-ide.png' })

// ③ M2：视图切换钮回沟通协作
const toggle = page.locator('[data-testid="ia-view-toggle"]')
await clearMasks()
if (await toggle.count() > 0) { await toggle.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(2500) }
ok('M2 切换钮回 /app', page.url().includes('/#/app'), page.url())

// ④ M1：看板 /app/board 可达（注意力条 swarm kanban 入口为产品动线，此处直访验证面）
await page.goto(BASE + '/#/app/board')
await page.waitForTimeout(4500)
ok('M1 /app/board 渲染', (await page.locator('main').count()) > 0, page.url())
await page.screenshot({ path: shots + '/03-app-board.png' })

// ⑤ M6：/app/l 旧画布入口 → 运行中心
await page.goto(BASE + '/#/app/l/lp-1')
await page.waitForURL(u => String(u).includes('/#/app/runs'), { timeout: 8000 }).catch(() => {})
// 同文档 hash 跳转偶发被守卫弹回（walkthrough 实测），硬重载后路由表冷启确定重定向
if (!page.url().includes('/#/app/runs')) { await page.reload(); await page.waitForTimeout(5000) }
ok('M6 /app/l → /app/runs', page.url().includes('/#/app/runs'), page.url())
await page.screenshot({ path: shots + '/04-app-runs.png' })

// ⑥ M6：运行详情空态不炸（无数据环境）；loop 画布节在非循环 run 下隐藏
await page.goto(BASE + '/#/app/runs/run-nonexistent')
await page.waitForTimeout(4000)
const body = await page.locator('main, .rd-view').first().innerText().catch(() => '')
ok('M6 运行详情页可达不白屏', body.length > 0, body.slice(0, 60))
ok('M6 非循环 run 无画布节', (await page.locator('[data-testid="rd-loop-canvas"]').count()) === 0)
await page.screenshot({ path: shots + '/05-run-detail.png' })

// ── P10 精简批断言 ──
// S1：系统组无 技能用量/主题/宠物（独立新页读侧栏）
{
  const p2 = await ctx.newPage()
  await p2.goto(BASE + '/')
  await p2.evaluate(t => {
    localStorage.setItem('hermes_api_key', t)
    localStorage.setItem('hermes_server_url', location.origin)
    localStorage.setItem('hermes_locale', 'zh')
  }, login.token)
  await p2.goto(BASE + '/#/hermes/logs')
  await p2.waitForTimeout(5000)
  const nav = await p2.locator('.sidebar-nav').innerText().catch(() => '')
  ok('S1 系统组无技能用量', !nav.includes('技能用量'))
  ok('S1 系统组无主题', !nav.includes('主题'))
  ok('S1 系统组无宠物', !nav.includes('宠物'))
  ok('S1 系统组保留 日志/用量/设置', nav.includes('日志') && nav.includes('用量') && nav.includes('设置'))
  await p2.screenshot({ path: shots + '/06-sidebar-s1.png' })
  await p2.close()
}
// S5：/app/eng 重定向交付案例
await page.goto(BASE + '/#/app/eng')
await page.waitForTimeout(3500)
if (!page.url().includes('/app/runs') && !page.url().includes('/app/cases')) { await page.reload(); await page.waitForTimeout(5000) }
ok('S5 /app/eng 退役重定向（合并态→/app/runs）', page.url().includes('/#/app/runs') || page.url().includes('/#/app/cases'), page.url())
await page.screenshot({ path: shots + '/07-app-cases.png' })
// S7：页头无日程钮与探测组
await page.goto(BASE + '/#/app')
await page.waitForTimeout(4000)
ok('S7 页头无日程钮', (await page.locator('[data-testid="ia-header-schedule"]').count()) === 0)
ok('S7 页头无 Gateway 探测组', (await page.locator('.cockpit-top__grp').count()) === 0)
ok('S3 WebPet 默认关', (await page.locator('canvas, .web-pet, [class*="webpet"]').count()) === 0)
await page.screenshot({ path: shots + '/08-header-s7.png' })

// ── S3 补齐断言（cockpit-s3 轮）──
await page.goto(BASE + '/#/ekko/memory')
await page.waitForTimeout(3500)
if (!page.url().includes('/#/app')) { await page.reload(); await page.waitForTimeout(4000) }
ok('S3 ekko 路由守卫 → /app', page.url().includes('/#/app'), page.url())
await page.goto(BASE + '/#/share/group-chat/xyz')
await page.waitForTimeout(3500)
if (!page.url().includes('/#/app')) { await page.reload(); await page.waitForTimeout(4000) }
ok('S3 外链分享页守卫 → /app', page.url().includes('/#/app'), page.url())
await page.screenshot({ path: shots + '/09-s3-guards.png' })

await browser.close()
const fails = results.filter(r => !r.pass)
console.log(`\n==== 走查 ${results.length - fails.length}/${results.length} 通过 ====`)
process.exit(fails.length ? 1 : 0)
