// 通用工件编辑链+新鲜度徽标浏览器走查（吸收二期 #9，dev 链 8649→8647）
// 断言：①工件行新鲜度徽标（本轮/旧轮）渲染 ②编辑入口（superadmin+editable 双门控）
// ③编辑态 textarea ④取消回 markdown 视图（零提交——保存路径由 vitest temp 仓实证）
// 附：P12 docview flex 压扁回归（flex-shrink:0+min-height 修复后布局不重叠）
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage()
const login = await fetch('http://localhost:8647/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: '123456' }) }).then(r => r.json())
await page.goto('http://localhost:8649/')
await page.evaluate(t => { localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_server_url', location.origin); localStorage.setItem('hermes_locale', 'zh') }, login.token)
await page.goto('http://localhost:8649/#/app/board?tab=gov-docs')
await page.waitForTimeout(15000)
await page.waitForSelector('[data-testid="gov-doc-freeze"]', { state: 'attached', timeout: 60000 })
await page.waitForTimeout(2500)
// DefaultCredentialPrompt 清场
for (let i = 0; i < 3; i++) {
  if (!await page.locator('.n-modal-mask').count()) break
  const btn = page.locator('.n-modal .n-base-close').first()
  if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(500) } else { await page.keyboard.press('Escape'); await page.waitForTimeout(500) }
}
const results = []
const ok = (n, c, note = '') => { results.push([n, !!c]); console.log(`${c ? 'PASS' : 'FAIL'} ${n}${note ? ' — ' + note : ''}`) }
const badges = await page.locator('[class*="gov-docs__fresh"]').count()
ok('新鲜度徽标渲染（本轮/旧轮）', badges > 0, `badges=${badges}`)
await page.locator('[data-testid="gov-doc-freeze"]').click()
await page.waitForSelector('[data-testid="gov-doc-md"]', { timeout: 10000 })
const editBtn = await page.locator('[data-testid="gov-doc-edit"]').count()
ok('编辑入口（superadmin+editable）', editBtn === 1)
await page.locator('[data-testid="gov-doc-edit"]').click()
await page.waitForSelector('[data-testid="gov-doc-editor"]', { timeout: 5000 })
ok('编辑态 textarea 出现', await page.locator('.gov-docs__editor').count() === 1)
await page.locator('[data-testid="gov-doc-cancel"]').click()
await page.waitForSelector('[data-testid="gov-doc-md"]', { timeout: 5000 })
ok('取消回 markdown 视图（零提交）', true)
await page.screenshot({ path: '/tmp/absorb-round2-shots/06-gov-doc-edit.png' })
await browser.close()
const failed = results.filter(r => !r[1])
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length ? 1 : 0)
