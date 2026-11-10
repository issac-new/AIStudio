// 生产链看板写路径走查（2026-11-04 r26 未做项「生产链交互级」收口）
// daily-workbench E 块的生产链移植：该脚本 A1 依赖 dev 自动登录链（矩阵桥）故
// dev 专属；本脚本走 API 显式登录，可在任意 WALK_BASE（dev 8649/生产 dist 链）跑。
// 断言：E4 行内建卡→板面出现→E2 抽屉开/关→E5a triage→review 拒 409→
// E5b ready→review 后 ?task= 深链抽屉审批按钮区（approve/reject）→清理。
// 环境要求：WALK_LOGIN 账户（默认 admin:dev-bootstrap）。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = process.env.WALK_BASE || 'http://localhost:8649'
const API = process.env.WALK_API || 'http://localhost:8647'
const shots = '/tmp/prod-board-write-shots'
mkdirSync(shots, { recursive: true })

const results = []
const ok = (name, cond, note = '') => {
  results.push({ name, pass: !!cond, note })
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
let createdId = ''
let reviewCardId = ''
const page = await (await browser.newContext({ viewport: { width: 1560, height: 940 } })).newPage()
try {
  const [username, password] = (process.env.WALK_LOGIN || 'admin:dev-bootstrap').split(/:(.+)/)
  const login = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }).then(r => r.json()).catch(() => null)
  if (!login?.token) { console.error('login failed'); process.exit(1) }
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(t => { localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_locale', 'zh') }, login.token)
  // 生产链冷启动竞态（r26 实录）：注入 token 后 app 可能已按未认证态启动，后续
  // hash 直达被落地重定向覆盖（connections→chat）。reload 让 app 按认证态重启，
  // 等 Vue 挂载+启动占位消失再导航（walk-routes ensureLogin 同款判据）。
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const el = document.querySelector('#app')
    return Boolean(el?.__vue_app__) && !(document.body?.innerText || '').includes('AIStudio 加载中')
  }, undefined, { timeout: 60000 }).catch(() => {})
  // 遮罩清理（2026-11-10 交互轮工装债）：空 Profile（未配大模型）环境首屏弹
  // 「未配置大模型」引导模态，n-modal-mask 拦原生点击——E4 建卡点击静默失效。
  // 与其他走查脚本同款 Escape×3 清障后再交互（有 provider 的环境此步为 no-op）。
  for (let i = 0; i < 3 && await page.locator('.n-modal-mask').count(); i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }

  // E4 行内建卡（?new=1 深链自动收窄唯一板；triage 列=原始想法不自动派发）
  await page.goto(BASE + '/#/app/board?new=1', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="kanban-column-triage"], .kanban-task-card', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const creator = page.locator('[data-testid="kanban-column-triage"] textarea, [data-testid="kanban-column-triage"] input').first()
  const mark = `[走查]生产链写路径卡-${Date.now().toString(36)}`
  if (await creator.count()) {
    await creator.fill(mark)
    await page.waitForTimeout(300)
    const submitBtn = page.locator('[data-testid="kanban-column-triage"] button').filter({ hasText: /创建|添加|Create|Add/ }).first()
    if (await submitBtn.count()) {
      await submitBtn.click({ force: true })
      let appear = false
      for (let i = 0; i < 6 && !appear; i++) { await page.waitForTimeout(1500); appear = await page.evaluate((m) => (document.body.innerText || '').includes(m), mark) }
      ok('E4 行内建卡提交→卡出现在板面', appear, `title=${mark}`)
      createdId = await page.evaluate((m) => {
        const hit = [...document.querySelectorAll('.kanban-task-card[data-task-id]')].find((c) => (c.textContent || '').includes(m))
        return hit?.getAttribute('data-task-id') || ''
      }, mark).catch(() => '')
    } else ok('E4 行内建卡提交→卡出现在板面', false, '未找到提交按钮')
  } else ok('E4 行内建卡表单（?new=1 直开）', false, 'triage 列未见建卡输入框')
  await page.screenshot({ path: `${shots}/01-board-new.png` })

  // E2 抽屉开（点刚建的卡）→关（Escape+close 双路）
  if (createdId) {
    await page.locator(`.kanban-task-card[data-task-id="${createdId}"]`).first().click({ force: true }).catch(() => {})
    let drawerOpen = false
    for (let i = 0; i < 5 && !drawerOpen; i++) { await page.waitForTimeout(1000); drawerOpen = await page.locator('[data-testid="kanban-task-drawer"]').isVisible().catch(() => false) }
    ok('E2 卡片点击→详情抽屉打开', drawerOpen, `id=${createdId}`)
    await page.screenshot({ path: `${shots}/02-drawer.png` })
    for (let i = 0; i < 4 && await page.locator('[data-testid="kanban-task-drawer"]').isVisible().catch(() => false); i++) {
      await page.keyboard.press('Escape'); await page.waitForTimeout(500)
      const mask = page.locator('.n-drawer-close').first()
      if (await mask.count().catch(() => 0)) { await mask.click({ force: true }).catch(() => {}); await page.waitForTimeout(400) }
    }
    ok('E2b 抽屉关毕', !(await page.locator('[data-testid="kanban-task-drawer"]').isVisible().catch(() => false)), 'Escape+close 双路')
  }

  // E5a triage→review 拒 409（补丁 713 语义）＋E5b ready→review 深链审批按钮区
  if (createdId) {
    const H = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' }
    const triagePatch = await fetch(`${API}/api/hermes/kanban/${encodeURIComponent(createdId)}?board=default`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'review' }) })
    ok('E5a 非法转移语义（triage→review 拒 409）', triagePatch.status === 409, `PATCH=${triagePatch.status}`)
    const c = await fetch(`${API}/api/hermes/kanban?board=default`, { method: 'POST', headers: H, body: JSON.stringify({ title: '[走查]生产链审批面卡', status: 'ready' }) }).then(r => r.json()).catch(() => null)
    reviewCardId = c?.task?.id || ''
    let reviewPatch = 0
    if (reviewCardId) reviewPatch = (await fetch(`${API}/api/hermes/kanban/${encodeURIComponent(reviewCardId)}?board=default`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'review' }) })).status
    ok('E5 前置 ready→review 转移', reviewPatch === 200, `PATCH=${reviewPatch}`)
    if (reviewPatch === 200) {
      await page.goto(BASE + '/#/app/board?task=' + encodeURIComponent(reviewCardId), { waitUntil: 'domcontentloaded' })
      let drawerInfo = { approve: false, reject: false }
      for (let i = 0; i < 8 && !(drawerInfo.approve && drawerInfo.reject); i++) {
        await page.waitForTimeout(1200)
        drawerInfo = await page.evaluate(() => {
          const drawer = document.querySelector('[data-testid="kanban-task-drawer"]')
          const text = drawer?.textContent || ''
          return { approve: /验收|批准|Approve/.test(text), reject: /打回|拒绝|Reject/.test(text) }
        }).catch(() => ({ approve: false, reject: false }))
      }
      ok('E5b review 态卡抽屉审批按钮区（验收/打回）', drawerInfo.approve && drawerInfo.reject, JSON.stringify(drawerInfo))
      await page.screenshot({ path: `${shots}/03-review-drawer.png` })
    }
  }
} finally {
  // 清理：删两张走查卡（先关抽屉防 DELETE 后 WS 推送撞已卸载组件）；用同源
  // WALK_LOGIN 账户重铸 token（login 在 try 块作用域，finally 取不到）
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(300)
  const [u, p] = (process.env.WALK_LOGIN || 'admin:dev-bootstrap').split(/:(.+)/)
  const relogin = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }).then(r => r.json()).catch(() => null)
  const H = { Authorization: `Bearer ${relogin?.token || ''}` }
  for (const id of [createdId, reviewCardId]) if (id) await fetch(`${API}/api/hermes/kanban/${id}`, { method: 'DELETE', headers: H }).catch(() => {})
  console.log('  [cleanup] 走查卡已清理')
  await browser.close().catch(() => {})
}
const failed = results.filter(r => !r.pass)
console.log(`\n== 走查 ${results.length - failed.length}/${results.length} ==`)
if (failed.length) { console.log(JSON.stringify(failed, null, 2)); process.exit(1) }
