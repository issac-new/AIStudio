#!/usr/bin/env node
// overlay/scripts/regression/ide-work-mode-walkthrough.mjs
// 编程/工作双模式浏览器走查（有状态：会新建一个工作任务，仅在 dev/测试环境跑）。
// 用法：
//   npm run dev                       # 或私有 dev（IDE_SMOKE_BASE 指向它）
//   IDE_SMOKE_BASE=http://localhost:8649 node scripts/regression/ide-work-mode-walkthrough.mjs
// 覆盖 21 项：模式 chip/默认编程、终端/审查/内联评审/轮结果/回放的显隐、
// 聊天列 is-ide-work-mode、命令面板模式命令与终端/审查直达隐藏、Cmd/Ctrl+Shift+U、
// 工作任务新建后的空态四类起步、页面无未捕获异常、截图落盘。
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('playwright')

const BASE = process.env.IDE_SMOKE_BASE?.trim() || 'http://localhost:8649'
const OUT = process.env.IDE_SMOKE_OUT?.trim() || mkdtempSync(join(tmpdir(), 'ide-work-mode-'))
mkdirSync(OUT, { recursive: true })
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ headless: !process.env.IDE_SMOKE_HEADFUL, channel: process.env.IDE_SMOKE_CHANNEL || 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)))
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 300)) })

try {
  await page.goto(`${BASE}/#/app/ide`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForSelector('.ide-shell', { timeout: 60_000 })
  await page.waitForTimeout(2500)

  const chip = page.locator('[data-testid="ide-mode-chip"]')
  record('状态栏模式 chip 存在', (await chip.count()) === 1)
  record('默认编程模式', (await chip.innerText()).trim() === '编程')
  record('编程模式显示终端页签', (await page.locator('[data-testid="ide-sidepane-tab-terminal"]').count()) === 1)
  record('编程模式显示审查页签', (await page.locator('[data-testid="ide-sidepane-tab-review"]').count()) === 1)

  await chip.click()
  await page.waitForTimeout(600)
  record('点击后切到工作模式', (await chip.innerText()).trim() === '工作')
  record('工作模式隐藏终端页签', (await page.locator('[data-testid="ide-sidepane-tab-terminal"]').count()) === 0)
  record('工作模式隐藏审查页签', (await page.locator('[data-testid="ide-sidepane-tab-review"]').count()) === 0)
  record('聊天列挂 is-ide-work-mode', (await page.locator('.ide-chat.is-ide-work-mode').count()) === 1)
  record('工作模式隐藏内联评审面板', (await page.locator('[data-testid="ide-review-panel"]').count()) === 0)
  record('任务侧栏工作按钮存在', (await page.locator('[data-testid="ide-task-mode-work"]').count()) === 1)

  await page.keyboard.press(`${MOD}+k`)
  await page.waitForTimeout(600)
  const paletteText = await page.locator('.ide-palette__panel').innerText().catch(() => '')
  record('命令面板出现切换回编程命令', paletteText.includes('切换到编程模式'))
  record('命令面板无终端页签直达', !paletteText.includes('页签: 终端'))
  record('命令面板无审查页签直达', !paletteText.includes('页签: 代码审查'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  await page.locator('body').click({ position: { x: 600, y: 300 } })
  await page.keyboard.press(`${MOD}+Shift+U`)
  await page.waitForTimeout(600)
  record('快捷键 Cmd/Ctrl+Shift+U 切回编程', (await chip.innerText()).trim() === '编程')
  record('编程模式恢复终端页签', (await page.locator('[data-testid="ide-sidepane-tab-terminal"]').count()) === 1)
  record('编程模式恢复内联评审面板', (await page.locator('[data-testid="ide-review-panel"]').count()) === 1)

  await chip.click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="ide-task-new"]').click()
  await page.waitForTimeout(1500)
  const enter = page.getByText('进入会话工作区', { exact: true })
  if (await enter.count()) { await enter.first().click(); await page.waitForTimeout(1200) }
  const workEmpty = await page.locator('[data-testid="ide-work-empty"]').count()
  record('工作任务空态渲染（四类起步）', workEmpty === 1)
  if (workEmpty === 1) {
    record('空态含写文档起步', (await page.locator('[data-testid="ide-work-starter-doc"]').count()) === 1)
    record('空态含做调研起步', (await page.locator('[data-testid="ide-work-starter-research"]').count()) === 1)
  }

  await page.screenshot({ path: join(OUT, 'work-mode.png'), fullPage: false })
  record('截图已落盘', true, join(OUT, 'work-mode.png'))

  const fatal = pageErrors.filter((t) => !/Failed to load resource|401|403|404|503|ResizeObserver/.test(t))
  record('无页面级 JS 异常', fatal.length === 0, fatal.slice(0, 3).join(' | '))
} catch (err) {
  record('走查异常', false, String(err).slice(0, 400))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length ? 1 : 0)
