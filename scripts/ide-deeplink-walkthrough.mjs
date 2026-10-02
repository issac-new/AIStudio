// run6 复盘走查：ide?task= 深链自动展开简报（dev 8649 热链路真数据）
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8649'
const login = await fetch('http://localhost:8647/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: '123456' }),
}).then(r => r.json())
const H = { 'Authorization': `Bearer ${login.token}`, 'Content-Type': 'application/json' }
// 建真任务
const created = await fetch('http://localhost:8647/api/hermes/kanban', {
  method: 'POST', headers: H,
  body: JSON.stringify({ title: '走查-ide深链简报自动展开', body: 'RUN=run6 复盘走查任务。责任人：admin', priority: 1 }),
}).then(r => r.json()).catch(e => ({ err: String(e) }))
const taskId = created.task?.id ?? created.id
console.log('建任务:', JSON.stringify(created).slice(0, 120))
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
await p.goto(BASE + '/')
await p.evaluate(t => {
  localStorage.setItem('hermes_api_key', t)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
}, login.token)
await p.goto(`about:blank`)
await p.goto(`${BASE}/app/ide?task=${taskId}`)
await p.waitForTimeout(9000)
for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(200) }
await p.evaluate(() => document.querySelectorAll('.n-modal-mask').forEach(m => m.remove())).catch(() => {})
const drawer = await p.$('[data-testid="ide-briefing-drawer"]')
console.log('PASS drawer-visible:', !!drawer)
const drawerText = drawer ? (await drawer.innerText()).slice(0, 300).replace(/\n/g, ' | ') : '(无)'
console.log('抽屉文本:', drawerText)
console.log('PASS task-title-in-drawer:', drawerText.includes('ide深链简报'))
await p.screenshot({ path: '/tmp/ide-deeplink-brief.png', fullPage: false })
// 清理：完成任务
if (taskId) {
  const done = await fetch(`http://localhost:8647/api/hermes/kanban/tasks/${taskId}/complete`, { method: 'POST', headers: H, body: JSON.stringify({ summary: '走查完成即清' }) }).then(r => r.status).catch(e => String(e))
  console.log('清理 complete →', done)
}
await browser.close()
