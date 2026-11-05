// 组织治理三页签实物走查（2026-11-05 收口）：姿态/研发效能/协作与知识。
// 环境：vite 8771 + 后端 8648（NODE_ENV=production + 空 appHome + DEV_BOOTSTRAP 换库，
// 不触碰真实用户库）。判据：三个 data-testid 区块渲染 + 关键字可见（不是空壳）。
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const API = process.env.WALK_API || 'http://127.0.0.1:8648'
const BASE = process.env.WALK_BASE || 'http://localhost:8771'
const OUT = process.env.WALK_SHOTS || '/tmp/aistudio-gov-research/shots'
mkdirSync(OUT, { recursive: true })

const results = []
const record = (name, ok, note = '') => {
  results.push({ name, ok, note })
  console.log(`${ok ? '✓' : '✗'} ${name}${note ? ` — ${note}` : ''}`)
}

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'dev-bootstrap' }),
}).then((r) => r.json()).catch((e) => ({ error: String(e) }))
if (!login.token) {
  console.log('login failed:', login.error || login.detail || JSON.stringify(login))
  process.exit(1)
}
console.log('login ok')

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' })

async function open(path) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 200)))
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate((t) => {
    localStorage.setItem('hermes_api_key', t)
    localStorage.setItem('hermes_server_url', `${location.origin}`)
    localStorage.setItem('hermes_locale', 'zh')
  }, login.token)
  await page.goto(`${BASE}/#${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  return page
}

/** 等元素进 DOM（attached 而非 visible：页签面板挂载时机与可见性不同步）。 */
async function waitTestId(page, id, timeout = 60000) {
  try {
    await page.waitForSelector(`[data-testid="${id}"]`, { state: 'attached', timeout })
    // 面板挂载后各区块自取数，留出首屏取数 + vite 首次 chunk 编译时间
    await page.waitForTimeout(3500)
    return true
  } catch { return false }
}

/** 轮询等待某段文本出现（取数是异步的，读早了会误判成空壳）。 */
async function waitText(page, selector, re, timeout = 12000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const t = await page.locator(selector).innerText().catch(() => '')
    if (re.test(t)) return t
    await page.waitForTimeout(400)
  }
  return await page.locator(selector).innerText().catch(() => '')
}

// ── 1. 治理姿态：自治刻度 ──
{
  const page = await open('/app/stage/govern?tab=posture')
  const ok1 = await waitTestId(page, 'autonomy-scale-section')
  record('姿态页签渲染自治刻度区块', ok1)
  if (ok1) {
    const text = await waitText(page, '[data-testid="autonomy-scale-section"]', /自主圈|人类圈|未登记自治刻度|无自治配置/)
    record('含三圈配比或未治理判词', /自主圈|人类圈|未登记自治刻度|无自治配置/.test(text), text.slice(0, 80).replace(/\n/g, ' '))
    record('含户口缺口块', text.includes('Agent 户口缺口'))
    record('含双签判定块', text.includes('双签判定'))
    await page.locator('[data-testid="autonomy-scale-section"]').screenshot({ path: `${OUT}/1-autonomy-scale.png` }).catch(() => {})
  }
  await page.screenshot({ path: `${OUT}/1-posture-full.png`, fullPage: false }).catch(() => {})
  await page.close()
}

// ── 2. 研发效能：度量纪律 ──
{
  const page = await open('/app/stage/govern?tab=metrics')
  const ok2 = await waitTestId(page, 'metric-discipline-section')
  if (!ok2) {
    const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')).filter(Boolean))
    console.log('  [debug] testid 数', ids.length, '｜含 stg-tab-metrics:', ids.includes('stg-tab-metrics'), '｜含 metric:', ids.filter((x) => /metric/i.test(x)).join(','))
    console.log('  [debug] url', page.url())
    console.log('  [debug] body', (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, ' | '))
  }
  record('研发效能页签渲染度量纪律区块', ok2)
  if (ok2) {
    const text = await waitText(page, '[data-testid="metric-discipline-section"]', /measure\s*\d+/)
    record('含双轨计数', /measure\s*\d+/.test(text), text.slice(0, 90).replace(/\n/g, ' '))
    record('含装饰化判据句', text.includes('哪个决策'))
    record('含四类核心读数或缺口', /自主运营比例|人机配比|单任务人时|返工率/.test(text))
    record('含技能调用频次或缺口说明', /技能调用\s*\d+\s*次|技能名|工具审计面/.test(text))
    await page.locator('[data-testid="metric-discipline-section"]').screenshot({ path: `${OUT}/2-metric-discipline.png` }).catch(() => {})
  }
  await page.close()
}

// ── 3. 协作与知识：假设登记簿 ──
{
  const page = await open('/app/board?tab=gov-org')
  const ok3 = await waitTestId(page, 'premise-log-section')
  record('协作与知识页签渲染假设登记簿区块', ok3)
  if (ok3) {
    const text = await waitText(page, '[data-testid="premise-log-section"]', /在册\s*\d+|尚无假设登记/)
    record('含台账统计或空态判词', /在册\s*\d+|尚无假设登记/.test(text), text.slice(0, 90).replace(/\n/g, ' '))
    record('含到期/重评队列或登记表单', text.includes('登记假设'))
    await page.locator('[data-testid="premise-log-section"]').screenshot({ path: `${OUT}/3-premise-log.png` }).catch(() => {})
  }
  await page.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n通过 ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  console.log('未通过：', failed.map((f) => f.name).join('；'))
  process.exit(1)
}
