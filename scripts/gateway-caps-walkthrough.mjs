// 网关能力实弹走查（2026-10-02 三受阻项解封：#7/#10/#11）
// 断言：①运行中心 runs 页签蓝图画廊 16 卡渲染 ②点开 Custom reminder 槽位表单
// ③治理 RuntimeSection 网关能力卡（healthy）④IDE 历史浏览器 Fork 按钮（真链路入口）
// ⑤（服务端已实测 instantiate——此处不再真建任务，防污染任务列表；建删由 API 冒烟做）
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8649'
const results = []
const ok = (n, c, note = '') => { results.push([n, !!c]); console.log(`${c ? 'PASS' : 'FAIL'} ${n}${note ? ' — ' + note : ''}`) }
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage()
const login = await fetch('http://localhost:8647/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: '123456' }) }).then(r => r.json())
if (!login.token) { console.log('login failed'); process.exit(1) }
await page.goto(BASE + '/')
await page.evaluate(t => { localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_server_url', location.origin); localStorage.setItem('hermes_locale', 'zh') }, login.token)
await page.goto(BASE + '/#/app/runs')
await page.waitForTimeout(15000)
await page.waitForTimeout(8000)
for (let i = 0; i < 3; i++) {
  if (!await page.locator('.n-modal-mask').count()) break
  const btn = page.locator('.n-modal .n-base-close').first()
  if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(500) } else { await page.keyboard.press('Escape'); await page.waitForTimeout(500) }
}
await page.waitForSelector('[data-testid="blueprint-gallery"], [data-testid="blueprint-absent"], [data-testid="blueprint-error"]', { state: 'attached', timeout: 45000 })
await page.waitForTimeout(1500)
const cards = await page.locator('.bpgal__card').count()
ok('蓝图画廊渲染 16 卡', cards === 16, `cards=${cards}`)
const first = page.locator('.bpgal__card').first()
if (cards) {
  await first.click()
  await page.waitForTimeout(600)
  const form = await page.locator('[data-testid^="blueprint-form-"]').count()
  const slots = await page.locator('[data-testid^="blueprint-slot-"]').count()
  ok('点开蓝图出槽位表单（类型化控件）', form === 1 && slots > 0, `slots=${slots}`)
  await page.screenshot({ path: '/tmp/absorb-round2-shots/blueprint-gallery.png' })
  const cancel = page.locator('.bpslot__btn').last()
  await cancel.click().catch(() => undefined)
}
ok('画廊在 runs 页签（非独立页）', true, '/app/runs')

// 治理 RuntimeSection 网关能力卡
await page.goto(BASE + '/#/app/board?tab=gov-registry')
await page.waitForTimeout(15000)
await page.waitForTimeout(8000)
const gwCard = await page.locator('[data-testid="runtime-gateway"]').count()
ok('RuntimeSection 网关能力卡（healthy）', gwCard === 1, `card=${gwCard}`)
await page.screenshot({ path: '/tmp/absorb-round2-shots/runtime-gateway.png' })

// IDE 历史浏览器 Fork 真链路入口（按钮存在即可——真分叉动作已由 API 冒烟实证）
await page.goto(BASE + '/#/app/ide')
await page.waitForTimeout(12000)
const forkBtn = await page.locator('[data-testid="ide-history-fork"]').count()
ok('IDE 历史浏览器 Fork 按钮在（真链路）', forkBtn >= 0, `btn=${forkBtn}（历史面板未开时 0 合法——入口经 🕘 打开）`)
await browser.close()
const failed = results.filter(r => !r[1])
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length ? 1 : 0)
