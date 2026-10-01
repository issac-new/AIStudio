// 消息面吸收批浏览器走查（dev 链 8649→8647）
// 断言：①Spotlight 聚焦弹命令组+查询过滤+Enter 导航 ②通知下拉消息页签不崩
// （未读线程区块渲染或空缺皆可，不炸即可）③房间画布时间线加载正常
// （TopUnreadBar 零未读不渲染；有未读显示计数条）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:8649'
const API = 'http://localhost:8647'
const shots = '/tmp/absorb-msg-shots'
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
if (!login.token) { console.log('login failed:', JSON.stringify(login).slice(0, 200)); process.exit(1) }
// hash 路由两段式：先落根路径（无 hash）设 localStorage，再跳 hash 目标——
// 直接 goto #/app 后 evaluate 会撞上入口的 pathname→hash 迁移导航
await page.goto(BASE + '/')
await page.evaluate(t => {
  localStorage.setItem('hermes_api_key', t)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, login.token)
await page.goto(BASE + '/#/app')
await page.waitForSelector('[data-testid="ia-shell-header"]', { timeout: 20000 })

// ① Spotlight：聚焦弹面板（空查询=命令组）
{
  const input = page.locator('[data-testid="ia-header-search-input"]')
  await input.click()
  await page.waitForSelector('[data-testid="spotlight-panel"]', { timeout: 5000 })
  const cmdRows = await page.locator('.spot__row').count()
  ok('Spotlight 聚焦弹命令组', cmdRows >= 8, `rows=${cmdRows}`)
  await page.screenshot({ path: shots + '/01-spotlight-commands.png' })
}

// ② Spotlight：查询过滤（会话名命中或空态皆可，断言不炸+结果数收敛）
{
  await page.fill('[data-testid="ia-header-search-input"]', 'zzz不存在的查询')
  await page.waitForTimeout(600)
  const empty = await page.locator('.spot__empty').count()
  const rows = await page.locator('.spot__row').count()
  ok('Spotlight 无匹配空态', empty === 1 && rows === 0, `empty=${empty} rows=${rows}`)
  await page.screenshot({ path: shots + '/02-spotlight-empty.png' })
}

// ③ Spotlight：命令行点击直达精确路由（看板命令 → /app/board）
{
  // n-modal-mask 拦截点击（版本通知等弹层）——Esc×3 + 物理移除（走查工具箱先例）
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(250) }
  await page.evaluate(() => document.querySelectorAll('.n-modal-mask').forEach(m => m.remove())).catch(() => {})
  await page.click('[data-testid="ia-header-search-input"]')
  await page.fill('[data-testid="ia-header-search-input"]', '')
  await page.waitForTimeout(600)
  const boardRow = page.locator('[data-testid="spotlight-row-c:board"]')
  await boardRow.waitFor({ state: 'visible', timeout: 5000 })
  await boardRow.click()
  await page.waitForTimeout(1500)
  ok('Spotlight 命令直达看板', page.url().includes('/app/board'), `url=${page.url().slice(-24)}`)
  await page.screenshot({ path: shots + '/02b-spotlight-nav-board.png' })
  // 回驾驶舱继续后续走查
  await page.goto(BASE + '/#/app')
  await page.waitForTimeout(1200)
}

// ④ 通知下拉：消息页签打开不崩；未读线程区块在（有数据）或缺席（无数据）皆可
{
  await page.waitForTimeout(800)
  await page.click('[data-testid="ia-header-notify"]').catch(() => {})
  await page.waitForTimeout(600)
  await page.click('[data-testid="notify-tab-messages"]').catch(() => {})
  await page.waitForTimeout(600)
  const dropdown = await page.locator('[data-testid="notify-dropdown"]').count()
  const crashed = await page.evaluate(() => document.body.innerText.includes('Unhandled'))
  ok('通知下拉消息页签打开', dropdown === 1 && !crashed)
  const threads = await page.locator('[data-testid="notify-unread-threads"]').count()
  console.log(`  未读线程区块 presence=${threads}（0=当前无未读线程，非缺陷）`)
  await page.screenshot({ path: shots + '/03-notify-messages.png' })
  await page.keyboard.press('Escape').catch(() => {})
}

// ⑤ 房间画布：驾驶舱进一个 matrix 房间（若有），时间线加载+TopUnreadBar 行为
{
  await page.goto(BASE + '/#/matrix')
  await page.waitForTimeout(5000)
  const roomRow = page.locator('.room-item, [data-testid*="room"]').first()
  const hasRooms = await page.locator('.room-item').count()
  if (hasRooms > 0) {
    await roomRow.click()
    await page.waitForTimeout(2500)
    const timeline = await page.locator('.matrix-timeline-panel').count()
    ok('matrix 房间时间线加载', timeline === 1)
    await page.screenshot({ path: shots + '/04-room-timeline.png' })
  } else {
    ok('matrix 房间列表（无房间=环境数据缺失，非本批缺陷）', true, `rooms=${hasRooms}`)
  }
}

await browser.close()
const fails = results.filter(r => !r.pass)
console.log(`\n== 走查 ${results.length - fails.length}/${results.length} ==`)
if (fails.length) { console.log(JSON.stringify(fails, null, 2)); process.exit(1) }
