// ekko 开门走查（2026-10-02 用户裁定：默认实例验证，非 flag-on 专用实例）
// 断言：①设置侧栏 ekko 运维条目（superadmin）②点击进入 /ekko/settings 页可开
// ③四页 URL 直达不被守卫弹回 ④关闭路径仍在（代码级由 s3-feature-gates 守门）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
const BASE = 'http://localhost:8649'
const shots = '/tmp/absorb-round2-shots'
mkdirSync(shots, { recursive: true })
const results = []
const ok = (n, c, note = '') => { results.push([n, !!c]); console.log(`${c ? 'PASS' : 'FAIL'} ${n}${note ? ' — ' + note : ''}`) }
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage()
const login = await fetch('http://localhost:8647/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: '123456' }) }).then(r => r.json())
if (!login.token) { console.log('login failed'); process.exit(1) }
await page.goto(BASE + '/')
await page.evaluate(t => { localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_server_url', location.origin); localStorage.setItem('hermes_locale', 'zh') }, login.token)
await page.goto(BASE + '/#/app/settings')
await page.waitForSelector('[data-testid="ia-settings-sidebar"]', { timeout: 30000 })
await page.waitForTimeout(1500)
for (let i = 0; i < 3; i++) {
  if (!await page.locator('.n-modal-mask').count()) break
  const btn = page.locator('.n-modal .n-base-close').first()
  if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(500) } else { await page.keyboard.press('Escape'); await page.waitForTimeout(500) }
}
const hrefs = await page.locator('[data-testid="ia-settings-sidebar"] a').evaluateAll(els => els.map(a => a.getAttribute('href') ?? ''))
ok('侧栏 ekko 运维条目（默认实例）', hrefs.includes('#/ekko/settings'), hrefs.filter(h => h.includes('ekko')).join(','))
await page.goto(BASE + '/#/ekko/settings')
await page.waitForTimeout(5000)
const stayed = page.url().includes('/ekko/settings')
const bodyText = (await page.locator('body').innerText()).slice(0, 200)
ok('/ekko/settings 页面打开（不被守卫弹回）', stayed && !/404|not found/i.test(bodyText), 'url=' + page.url().split('#')[1])
await page.screenshot({ path: shots + '/ekko-open-settings.png' })
for (const r of ['ekko/memory', 'ekko/skills', 'ekko/mcp']) {
  await page.goto(BASE + '/#/' + r)
  await page.waitForTimeout(3500)
  ok(`/${r} URL 直达`, page.url().includes(r), 'url=' + page.url().split('#')[1])
}
await browser.close()
const failed = results.filter(r => !r[1])
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length ? 1 : 0)
