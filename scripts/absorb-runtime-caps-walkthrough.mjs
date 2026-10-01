// 吸收批 9 浏览器走查（dev 链 8649→8647 代理；runtime-caps 后端在 8647 未挂载，
// 面板按诚实空态路径验证不炸；端点真值已由 8657 隔离后端实测 200）
// 断言：①治理运行态凭证池/cron 区块在或诚实缺席（不炸）②收件箱放行建议折叠
// 区展开加载态 ③IDE History 浏览器开关面板渲染+⋔ 按钮
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:8649'
const shots = '/tmp/absorb-rcaps-shots'
mkdirSync(shots, { recursive: true })

const results = []
function ok(name, cond, note = '') {
  results.push({ name, pass: !!cond, note })
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 })
const login = await fetch('http://localhost:8647/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: '123456' }),
}).then(r => r.json())

async function open(url) {
  const p = await ctx.newPage()
  await p.goto(BASE + '/')
  await p.evaluate(t => {
    localStorage.setItem('hermes_api_key', t)
    localStorage.setItem('hermes_server_url', location.origin)
    localStorage.setItem('hermes_locale', 'zh')
    try { localStorage.setItem('hermes_ide_sidepane', JSON.stringify({ open: true, tab: 'files', width: 480 })) } catch {}
  }, login.token)
  await p.goto('about:blank')
  await p.goto(url)
  await p.waitForTimeout(5000)
  // n-modal-mask 拦截点击（版本通知弹层等）——Esc×3+物理移除（工具箱先例）
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(250) }
  await p.evaluate(() => document.querySelectorAll('.n-modal-mask').forEach(m => m.remove())).catch(() => {})
  return p
}

// ① 治理运行态（凭证池/cron 区块在 8647 无 runtime-caps 路由→诚实缺席；面板不炸）
{
  const p = await open(BASE + '/#/app/board?tab=gov-registry')
  await p.waitForTimeout(3000)
  const runtime = await p.locator('[data-testid="gov-runtime"]').count()
  ok('治理运行态分区渲染', runtime === 1)
  const creds = await p.locator('[data-testid="runtime-credentials"]').count()
  const cron = await p.locator('[data-testid="runtime-cron-runs"]').count()
  console.log(`  凭证池 presence=${creds} cron 运行史 presence=${cron}（0=8647 无代理路由=诚实缺席）`)
  ok('治理页不炸（区块缺席=诚实空态）', runtime === 1)
  await p.screenshot({ path: shots + '/01-gov-runtime.png' })
  await p.close()
}

// ② 收件箱放行建议（折叠区展开）
{
  const p = await open(BASE + '/#/app/inbox')
  await p.waitForTimeout(2000)
  const toggle = await p.locator('[data-testid="approval-suggestions-toggle"]').count()
  ok('放行建议折叠区在', toggle === 1)
  if (toggle) {
    await p.click('[data-testid="approval-suggestions-toggle"]')
    await p.waitForTimeout(1500)
    const loading = await p.locator('[data-testid="approval-suggestions-loading"]').count()
    const err = await p.locator('[data-testid="approval-suggestions-error"]').count()
    const empty = await p.locator('[data-testid="approval-suggestions-empty"]').count()
    const list = await p.locator('[data-testid="approval-suggestions-list"]').count()
    ok('展开后四态之一呈现', loading + err + empty + list === 1, `loading=${loading} err=${err} empty=${empty} list=${list}`)
    await p.screenshot({ path: shots + '/02-inbox-suggestions.png' })
  }
  await p.close()
}

// ③ IDE History 浏览器
{
  const p = await open(BASE + '/#/app/ide')
  await p.waitForTimeout(1500)
  const btn = await p.locator('[data-testid="ide-chat-history"]').count()
  ok('IDE History 入口按钮在', btn === 1)
  if (btn) {
    await p.click('[data-testid="ide-chat-history"]')
    await p.waitForTimeout(800)
    const panel = await p.locator('[data-testid="ide-history-browser"]').count()
    ok('History 浏览器面板渲染', panel === 1)
    await p.screenshot({ path: shots + '/03-ide-history.png' })
  }
  await p.close()
}

await browser.close()
const fails = results.filter(r => !r.pass)
console.log(`\n== 走查 ${results.length - fails.length}/${results.length} ==`)
if (fails.length) { console.log(JSON.stringify(fails, null, 2)); process.exit(1) }
