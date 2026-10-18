#!/usr/bin/env node
// overlay/scripts/regression/ide-selfcheck-cli.mjs
// 自检 CLI：驱动 IDE 内的「IDE 自检」弹层，输出 JSON（供 CI/合入清单消费）。
// 只读；与 UI 自检同一批探针，避免两套判据漂移。
//
// 用法：node scripts/regression/ide-selfcheck-cli.mjs
// 环境：IDE_SMOKE_BASE（默认 http://localhost:8649）
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const overlayRoot = resolve(here, '../..')
const require = createRequire(join(overlayRoot, 'package.json'))
const { chromium } = require('playwright')
const BASE = process.env.IDE_SMOKE_BASE?.trim() || 'http://localhost:8649'

const browser = await chromium.launch({ headless: true, channel: process.env.IDE_SMOKE_CHANNEL || 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
let exitCode = 1
try {
  await page.goto(`${BASE}/#/app/ide`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('.ide-shell', { timeout: 30_000 }).catch(() => {})
  if ((await page.locator('.ide-shell').count()) === 0) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.ide-shell', { timeout: 30_000 }).catch(() => {})
  }
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(600)
  await page.keyboard.type('自检')
  await page.waitForTimeout(400)
  await page.getByText('IDE 自检（全能力冒烟）', { exact: true }).first().click()
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="ide-selfcheck-summary"]')?.textContent?.trim()),
    { timeout: 30_000 },
  )
  const summary = await page.locator('[data-testid="ide-selfcheck-summary"]').innerText()
  const rows = await page.locator('.ide-selfcheck__row').evaluateAll((els) => els.map((el) => {
    const status = el.classList.contains('is-pass') ? 'pass' : el.classList.contains('is-warn') ? 'warn' : 'fail'
    return {
      id: el.getAttribute('data-testid') || '',
      status,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    }
  }))
  const count = (status) => rows.filter(row => row.status === status).length
  const result = { summary, pass: count('pass'), warn: count('warn'), fail: count('fail'), rows }
  console.log(JSON.stringify(result, null, 2))
  exitCode = result.fail === 0 ? 0 : 1
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  exitCode = 1
} finally {
  await browser.close()
}
process.exit(exitCode)
