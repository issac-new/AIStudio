// capture-demo-gov.mjs — 治理中心工件精准重拍（data-testid=gov-doc-<kind> + 详情头断言）
// 工件目录单一事实源：custom/server/governance/governance-controller.ts GOVERNANCE_DOCS
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const OUT = '/Volumes/nvme2230/lab/ncwk-sim-mux/evidence/20260928-product-demo/shots-v2'
const SIM = '/Volumes/nvme2230/lab/ncwk-sim-mux'

function tokenOf(user) {
  return readFileSync(`${SIM}/creds/${user}.token`, 'utf8').split('\n')[0].trim()
}

const login = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: tokenOf('fanfan'), matrixUserId: '@fanfan:matrix.test',
    deviceId: 'CAPTURE-GOV', homeserverUrl: 'http://127.0.0.1:8008',
  }),
}).then((r) => r.json())
if (!login.token) throw new Error('matrix-login 失败')

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.setDefaultTimeout(70000)

await page.goto(BASE + '/login')
await page.evaluate((tk) => {
  localStorage.setItem('hermes_api_key', tk)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
  // 浏览器侧 matrix-js-sdk 凭据（snake_case 键，坑②）
  localStorage.setItem('matrix_access_token', readFileSync(`${SIM}/creds/fanfan.token`, 'utf8').split('\n')[0].trim())
  localStorage.setItem('matrix_user_id', '@fanfan:matrix.test')
  localStorage.setItem('matrix_device_id', 'CAPTURE-GOV')
  localStorage.setItem('matrix_homeserver_url', 'http://127.0.0.1:8008')
}, [login.token])

async function dismissOverlays() {
  for (let i = 0; i < 3; i++) {
    const bannerBtn = page.locator('[data-testid="studio-announcement"] button').last()
    if (await bannerBtn.isVisible().catch(() => false)) { await bannerBtn.click().catch(() => {}); await page.waitForTimeout(400); continue }
    break
  }
}

// (出图名, 工件 kind, 详情头应含标题片段)
const DOCS = [
  ['s01b-roster', 'roster', '账号清单'],
  ['s05b-appregistry', 'app-registry', '应用资产'],
  ['s06b-org', 'org', '组织与权限'],
  ['s11b-tasklist', 'tasklist', 'SMART'],
  ['s16b-schedule', 'schedule', '排期'],
  ['s17b-testlog', 'testlog-mp', 'G3 证据'],
  ['s19-testreport-doc', 'test', '测试报告'],
  ['s20-release-gate', 'release', '发布说明'],
  ['s21-uat-doc', 'uat', 'UAT'],
  ['s23-audit-doc', 'audit', '审计'],
  ['s24-retro-doc', 'retro', '复盘'],
]

await page.goto(BASE + '/#/app/gov', { waitUntil: 'domcontentloaded' })
await page.locator('text=治理中心').first().waitFor({ state: 'visible', timeout: 60000 })
await page.waitForTimeout(2500)
await dismissOverlays()

for (const [name, kind, titleFrag] of DOCS) {
  const btn = page.locator(`[data-testid="gov-doc-${kind}"]`)
  if (await btn.count() === 0) { console.log(`  [warn] ${name}: gov-doc-${kind} 不存在`); continue }
  await btn.first().scrollIntoViewIfNeeded().catch(() => {})
  await btn.first().click().catch((e) => console.log(`  [warn] ${name}: click fail ${e.message}`))
  await page.locator('.gov-docs__docview-hd b', { hasText: titleFrag }).first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .catch(() => console.log(`  [warn] ${name}: 详情头未含 "${titleFrag}"`))
  await page.waitForTimeout(1500)
  await dismissOverlays()
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot:', name)
}

await browser.close()
console.log('gov capture done')
