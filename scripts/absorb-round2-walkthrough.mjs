// 吸收二期 A/B+建议 3 浏览器走查（dev 链 8649→8647）
// 断言：①页头版本号钮→changelog 弹窗 ②Spotlight 深搜升级行→SessionSearchModal
// ③设置侧栏 terminal 条目在（superadmin）+petdex 条目默认隐（features.pet 关）
// ④FlowNav 排序三档切换器存在可点 ⑤房间路由 ?event= 深链不炸
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:8649'
const API = 'http://localhost:8647'
const shots = '/tmp/absorb-round2-shots'
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
// hash 路由两段式：先落根路径设 localStorage，再跳 hash 目标
await page.goto(BASE + '/')
await page.evaluate(t => {
  localStorage.setItem('hermes_api_key', t)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, login.token)
await page.goto(BASE + '/#/app')
await page.waitForSelector('[data-testid="ia-shell-header"]', { timeout: 20000 })

/** dev 实例 DefaultCredentialPrompt（默认口令告警）自动弹 n-modal 拦截点击：
 *  每次页面装载后统一清场（真实鼠标点关闭钮；无弹窗时静默跳过） */
async function dismissModals() {
  await page.waitForTimeout(1200)
  for (let i = 0; i < 3; i++) {
    const mask = await page.locator('.n-modal-mask').count()
    if (!mask) return
    const closeBtn = page.locator('.n-modal .n-base-close').first()
    if (await closeBtn.count()) {
      await closeBtn.click({ timeout: 2000 }).catch(() => undefined)
      await page.waitForTimeout(500)
    } else {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  }
}
await dismissModals()

// ① A3：页头版本号钮 → changelog 弹窗
{
  const btn = page.locator('[data-testid="ia-header-changelog"]')
  ok('A3 版本号入口存在', await btn.count() === 1)
  await btn.click()
  await page.waitForTimeout(500)
  const modalVisible = await page.locator('.ia-changelog').count()
  ok('A3 changelog 弹窗打开', modalVisible === 1)
  await page.screenshot({ path: shots + '/01-changelog.png' })
  // n-modal-mask 拦截后续点击（走查五坑之一）：真实鼠标点关闭钮——naive-ui
  // 关闭钮不响应合成 JS click（实测），必须 locator 真点
  await page.locator('.n-modal .n-base-close').click({ timeout: 3000 })
  // 收遮罩不可靠（关闭动画+route loading 叠加）：步骤间整页重载，状态靠
  // localStorage 持久，确定性最强；重载后统一清自动弹窗（DefaultCredentialPrompt）
  await page.goto(BASE + '/#/app')
  await page.waitForSelector('[data-testid="ia-shell-header"]', { timeout: 20000 })
  await dismissModals()
}

// ② A2：Spotlight 深搜升级行 → SessionSearchModal
{
  const input = page.locator('[data-testid="ia-header-search-input"]')
  await input.click()
  await page.waitForSelector('[data-testid="spotlight-panel"]', { timeout: 5000 })
  const foot = page.locator('[data-testid="spotlight-deep-search"]')
  ok('A2 Spotlight 深搜升级行存在', await foot.count() === 1)
  await foot.click()
  await page.waitForTimeout(600)
  ok('A2 SessionSearchModal 打开', await page.locator('.session-search-modal').count() === 1)
  await page.screenshot({ path: shots + '/02-session-search.png' })
  // 同上：整页重载出模态，避免遮罩/动画残留拦截后续步骤
  await page.goto(BASE + '/#/app')
  await page.waitForSelector('[data-testid="ia-shell-header"]', { timeout: 20000 })
  await dismissModals()
}

// ③ A1+A4：设置页侧栏——terminal 条目在（superadmin）、petdex 隐（默认关）
{
  await page.goto(BASE + '/#/app/settings')
  await page.waitForSelector('[data-testid="ia-settings-sidebar"]', { timeout: 20000 })
  await page.waitForTimeout(800)
  const sidebar = page.locator('[data-testid="ia-settings-sidebar"]')
  // href 断言代替文案断言（locale 加载时序使文案中英不定，href 是硬真值）
  const hrefs = await page.locator('[data-testid="ia-settings-sidebar"] a').evaluateAll(
    els => els.map(a => a.getAttribute('href') ?? ''))
  ok('A1 终端条目在（superadmin）', hrefs.includes('#/hermes/terminal'), 'link #/hermes/terminal')
  ok('A4 petdex 条目默认隐（features.pet 关）', !hrefs.includes('#/hermes/petdex'), 'petdex gated')
  ok('A4 agentManager 条目默认隐（features.agentManager 关）', !hrefs.includes('#/studio/agents'), 'agentManager gated')
  await page.screenshot({ path: shots + '/03-settings-sidebar.png' })
}

// ④ 建议 3：FlowNav 排序三档切换器
{
  await page.goto(BASE + '/#/app')
  await page.waitForSelector('[data-testid="flow-nav"]', { timeout: 20000 })
  const sorts = await page.locator('.flow-nav__sort').count()
  ok('建议3 排序切换器三档存在', sorts === 3, `sorts=${sorts}`)
  const alphaBtn = page.locator('[data-testid="flow-sort-alpha"]')
  await alphaBtn.click()
  await page.waitForTimeout(300)
  const persisted = await page.evaluate(() => localStorage.getItem('ia2.flow.sortMode'))
  ok('建议3 排序选择持久化 localStorage', persisted === 'alpha', `sortMode=${persisted}`)
  await page.screenshot({ path: shots + '/04-flow-sorts.png' })
}

// ⑤ B2：房间路由 ?event= 深链不炸（事件不存在时静默不跳，页面正常渲染）
{
  const roomLink = page.locator('[data-testid^="flow-session-"]').first()
  const hasRoom = await roomLink.count() > 0
  if (hasRoom) {
    await roomLink.click()
    await page.waitForTimeout(1200)
    const url = page.url()
    const withEvent = url + (url.includes('?') ? '&' : '?') + 'event=%24nonexistent-event-id'
    await page.goto(withEvent)
    await page.waitForTimeout(1500)
    const canvasOk = await page.locator('.matrix-room-canvas, [data-testid="flow-nav"]').count() > 0
    ok('B2 ?event= 深链不炸（不存在事件静默）', canvasOk)
    await page.screenshot({ path: shots + '/05-event-deeplink.png' })
  } else {
    ok('B2 ?event= 深链不炸', true, '无房间数据，跳过（空态合法）')
  }
}

await browser.close()
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length ? 1 : 0)
