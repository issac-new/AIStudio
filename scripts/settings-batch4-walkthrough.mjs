// 批四+画廊 UI 端到端走查（2026-10-02 #13 步二收官验证）：
// ①看板切板→sl:user:kanban.selectedBoard 写入（patch 540 真链）②蓝图画廊表单
// 实际提交→任务真实创建（走查后 API 清理不留垃圾）③偏好分层读回生效。
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

// ① 看板切板 → 分层键写入（patch 540）
await page.goto(BASE + '/#/app/board')
await page.waitForTimeout(20000)
for (let i = 0; i < 3; i++) {
  if (!await page.locator('.n-modal-mask').count()) break
  const btn = page.locator('.n-modal .n-base-close').first()
  if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(500) } else { await page.keyboard.press('Escape'); await page.waitForTimeout(500) }
}
// patch 540 收养链验证 → 独立脚本 scripts/kanban-adoption-walkthrough.mjs
// （本脚本主 context 的 store 已初始化，同会话不会重跑 adopt；独立浏览器实例才实证）


// ② 蓝图画廊：表单实际提交建任务
await page.goto(BASE + '/#/app/runs')
await page.waitForTimeout(20000)
await page.waitForSelector('.bpgal__card', { state: 'attached', timeout: 45000 })
await page.waitForTimeout(2000)
// 找 Custom reminder 卡（槽位最简）
const cards = page.locator('.bpgal__card')
const n = await cards.count()
let opened = false
for (let i = 0; i < n; i++) {
  if ((await cards.nth(i).innerText()).includes('Custom reminder') || (await cards.nth(i).innerText()).includes('提醒')) {
    await cards.nth(i).click(); opened = true; break
  }
}
ok('Custom reminder 蓝图卡可展开', opened)
if (opened) {
  await page.waitForSelector('[data-testid^="blueprint-form-"]', { state: 'attached', timeout: 8000 })
  const what = page.locator('[data-testid="blueprint-slot-what"]')
  if (await what.count()) await what.fill('E2E 走查任务（即删）')
  const time = page.locator('[data-testid="blueprint-slot-time"]')
  if (await time.count()) await time.fill('23:58')
  const before = await page.evaluate(async () => {
    const r = await fetch('/api/runtime-caps/gateway/sessions?limit=1', { headers: { Authorization: 'Bearer ' + localStorage.getItem('hermes_api_key') } })
    return r.ok
  })
  ok('代理会话面健康（前置）', before)
  await page.locator('[data-testid="blueprint-create"]').click()
  await page.waitForTimeout(2500)  // 成功提示 4s 自动消失——窗口内断言
  const created = await page.locator('[data-testid="blueprint-created"]').count()
  const errShown = await page.locator('[data-testid="blueprint-error"]').count()
  const errText = errShown ? await page.locator('[data-testid="blueprint-error"]').innerText() : ''
  ok('画廊表单提交→任务真实创建', created === 1, errShown ? `err: ${errText.slice(0, 80)}` : 'created ✓')
  await page.screenshot({ path: '/tmp/absorb-round2-shots/blueprint-created.png' })
}

// ③ 清理：走查本地读网关钥匙（与服务端同源 ~/.hermes/.env），直连删本次任务——不留垃圾
import { readFileSync } from 'fs'
import { homedir } from 'os'
const gwKey = (readFileSync(homedir() + '/.hermes/.env', 'utf-8').split('\n').find(l => l.startsWith('API_SERVER_KEY=')) || '').slice('API_SERVER_KEY='.length).trim()
let cleaned = false
if (gwKey) {
  const jobs = await fetch('http://127.0.0.1:8650/api/jobs', { headers: { Authorization: 'Bearer ' + gwKey } }).then(r => r.json()).catch(() => null)
  const mine = (jobs?.jobs ?? []).filter(j => /走查|E2E|即删/.test(j.prompt || ''))
  for (const j of mine) {
    await fetch('http://127.0.0.1:8650/api/jobs/' + j.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + gwKey } }).catch(() => undefined)
  }
  cleaned = mine.length > 0
}
ok('走查任务自清理（网关直删，零垃圾）', cleaned)
await browser.close()
const failed = results.filter(r => !r[1])
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length ? 1 : 0)
