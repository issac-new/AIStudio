// 看板选板收养链走查（2026-10-02 patch 540 实证）：独立浏览器实例注入遗留裸键
// hermes.kanban.selectedBoard=default → 装载 /app/board（store init 触发收养）→
// 断言分层键 sl:user:kanban.selectedBoard 落值+旧键退役。
// 之所以独立实例：settings-batch4 走查主 context 的 kanban store 已初始化，
// 同会话二次导航不会重跑 adopt——收养语义只在首个 store init 发生。
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
page.on('pageerror', e => console.log('PAGE-ERROR:', String(e).slice(0, 160)))
const login = await fetch('http://localhost:8647/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: '123456' }) }).then(r => r.json())
if (!login.token) { console.log('login failed'); process.exit(1) }
await page.goto('http://localhost:8649/')
await page.evaluate(t => { localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_server_url', location.origin); localStorage.setItem('hermes_locale', 'zh'); localStorage.setItem('hermes.kanban.selectedBoard', 'default') }, login.token)
await page.goto('http://localhost:8649/#/app/board')
await page.waitForTimeout(20000)
const info = await page.evaluate(() => ({
  slKeys: Object.keys(localStorage).filter(k => k.startsWith('sl:')),
  legacy: localStorage.getItem('hermes.kanban.selectedBoard'),
}))
const pass = info.slKeys.includes('sl:user:kanban.selectedBoard') && info.legacy === null
console.log(pass ? 'PASS patch 540 收养链（遗留裸键→分层 user 键，旧键退役）' : `FAIL ${JSON.stringify(info)}`)
await browser.close()
process.exit(pass ? 0 : 1)
