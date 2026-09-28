#!/usr/bin/env bash
# verify-governance.sh — 治理中心端到端复验（并行 WIP 收口后跑）
# 前提：studio :8802 在跑（mx-up.sh 或 dist/server/index.js）
# 产出：evidence/screenshots/steps/ui-gov-center.png + ui-gov-doc.png
set -euo pipefail
cd "$(dirname "$0")/../.."   # → upstream/hermes-studio
node - <<'EOF'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const OUT = '/Volumes/nvme2230/lab/ncwk-sim-mux/evidence/screenshots/steps'
const mtok = readFileSync('/Volumes/nvme2230/lab/ncwk-sim-mux/creds/fanfan.token', 'utf8').split('\n')[0].trim()
const login = await fetch('http://127.0.0.1:8802/api/auth/matrix-login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matrixAccessToken: mtok, matrixUserId: '@fanfan:matrix.test', deviceId: 'gov-verify', homeserverUrl: 'http://127.0.0.1:8008' }),
}).then(r => r.json())
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage()
page.on('console', m => { if (m.type() === 'error' && m.text().includes('mount')) console.error('[mount-err]', m.text().slice(0, 120)) })
await page.goto('http://127.0.0.1:8802/login')
await page.evaluate(([t]) => { localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_locale', 'zh') }, [login.token])
await page.goto('http://127.0.0.1:8802/app#/app/gov')
await page.waitForTimeout(7000)
for (const txt of ['知道了', 'Confirm']) {
  const btn = page.locator(`button:has-text("${txt}")`).first()
  if (await btn.isVisible().catch(() => false)) { await btn.click(); await page.waitForTimeout(600) }
}
await page.waitForTimeout(2000)
const txt = await page.evaluate(() => document.body.innerText)
if (!txt.includes('治理中心')) { console.error('FAIL: 治理中心未渲染（app 挂载被阻断？）'); process.exit(1) }
await page.screenshot({ path: OUT + '/ui-gov-center.png' })
await page.locator('[data-testid="gov-doc-freeze"]').click({ timeout: 8000 })
await page.waitForTimeout(2500)
if (!(await page.evaluate(() => document.body.innerText)).includes('frozen: true')) { console.error('FAIL: 冻结文档未渲染'); process.exit(1) }
await page.screenshot({ path: OUT + '/ui-gov-doc.png' })
console.log('OK: ui-gov-center.png + ui-gov-doc.png')
await browser.close()
EOF
