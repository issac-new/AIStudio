#!/usr/bin/env node
// overlay/scripts/regression/ide-smoke.mjs
// IDE 工作区冒烟（P0-6）：裸落地、会话/任务深链、命令面板、17 辅助页签、
// 状态栏配置、RunTrace Esc、自检弹层。只读，不改会话/仓库/配置。
//
// 用法：
//   npm run dev            # 另一个终端，8649/8647
//   node scripts/regression/ide-smoke.mjs
// 环境变量：IDE_SMOKE_BASE（默认 http://localhost:8649）、IDE_SMOKE_OUT、IDE_SMOKE_HEADFUL=1
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const overlayRoot = resolve(here, '../..')
const require = createRequire(join(overlayRoot, 'package.json'))
const { chromium } = require('playwright')

const BASE = process.env.IDE_SMOKE_BASE?.trim() || 'http://localhost:8649'
const OUT = process.env.IDE_SMOKE_OUT?.trim() || mkdtempSync(join(tmpdir(), 'ide-smoke-'))
mkdirSync(OUT, { recursive: true })

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function waitText(page, selector, timeout = 10_000) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel)
      return Boolean(el && (el.textContent || '').trim())
    },
    selector,
    { timeout },
  ).catch(() => {})
  return page.locator(selector).innerText().catch(() => '')
}

const browser = await chromium.launch({
  headless: !process.env.IDE_SMOKE_HEADFUL,
  channel: process.env.IDE_SMOKE_CHANNEL || 'chrome',
})
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 300)))

try {
  // 1. 裸落地
  await page.goto(`${BASE}/#/app/ide`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  // 冷启动 Vite 依赖预构建会短暂 504/动态 import 失败：重载一次再判定
  await page.waitForSelector('.ide-shell', { timeout: 30_000 }).catch(() => {})
  if ((await page.locator('.ide-shell').count()) === 0) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.ide-shell', { timeout: 30_000 }).catch(() => {})
  }
  // 预构建噪声不计入产品错误（壳就绪后重新计）
  pageErrors.length = 0
  await page.waitForTimeout(2_000)
  record('裸落地渲染 IDE 壳', (await page.locator('.ide-shell').count()) > 0, page.url())
  const hero = page.locator('[data-testid="ide-landing-hero"]')
  const item = page.locator('[data-testid^="ide-task-item-"] .ide-taskbar__item-main').first()
  if (await hero.count()) {
    await page.locator('[data-testid="ide-landing-enter"]').click().catch(() => {})
    await page.waitForTimeout(2_000)
  } else if (await item.count()) {
    await item.click().catch(() => {})
    await page.waitForTimeout(2_000)
  }
  record('会话列可进入', (await page.locator('.ide-chat').count()) > 0)

  // 2. 命令面板焦点/Esc
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(600)
  const paletteOpen = (await page.locator('.ide-palette').count()) > 0
  const focusIsInput = await page.evaluate(() => document.activeElement?.classList?.contains('ide-palette__input') ?? false)
  record('命令面板打开并聚焦输入框', paletteOpen && focusIsInput, `open=${paletteOpen} focus=${focusIsInput}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  record('命令面板 Esc 关闭', (await page.locator('.ide-palette').count()) === 0)

  // 3. 17 辅助页签逐个点开
  await page.locator('[data-testid="ide-sidepane-group-all"]').click().catch(() => {})
  await page.waitForTimeout(300)
  const tabs = ['files', 'review', 'terminal', 'wiki', 'memory', 'ctxarchive', 'tools', 'trajectory', 'workflow', 'kanban', 'assistant', 'board', 'browser', 'storage', 'mcp', 'hooks', 'slash']
  const tabFailures = []
  for (const tab of tabs) {
    const loc = page.locator(`[data-testid="ide-sidepane-tab-${tab}"]`)
    if (!(await loc.count())) { tabFailures.push(`${tab}:missing`); continue }
    await loc.click()
    await page.waitForTimeout(tab === 'storage' ? 5_000 : 600)
    const text = await page.locator('.ide-sidepane__body').innerText().catch(() => '')
    if (!text.trim()) tabFailures.push(`${tab}:empty`)
  }
  record('17 个辅助页签可打开', tabFailures.length === 0, tabFailures.join(','))

  // 4. 状态栏配置面板
  const slots = page.locator('[data-testid="ide-status-slots-btn"]')
  const slotsBox = await slots.boundingBox().catch(() => null)
  await slots.click({ timeout: 5_000 }).catch(() => {})
  const slotsVisible = await page.locator('[data-testid="ide-status-slots-panel"]').isVisible().catch(() => false)
  record('状态栏配置可点开', Boolean(slotsBox && slotsBox.width >= 18 && slotsVisible), `box=${slotsBox?.width ?? 'none'}`)
  await page.keyboard.press('Escape')

  // 5. 会话深链（取当前会话 id）
  const sessionId = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    return pinia?._s?.get('chat')?.activeSessionId ?? null
  }).catch(() => null)
  if (sessionId) {
    await page.goto(`${BASE}/#/app/ide?session=${encodeURIComponent(sessionId)}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5_000)
    const title = await page.locator('.ide-chat__title').innerText().catch(() => '')
    record('会话深链命中', Boolean(title.trim()) && (await page.locator('.ide-chat').count()) > 0, title.slice(0, 40))
  } else {
    record('会话深链命中', false, '无活动会话可验证')
  }

  // 6. 幽灵任务深链：不崩溃、抽屉自动收起
  await page.goto(`${BASE}/#/app/ide?task=ghost-task-smoke`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ide-shell', { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(3_000)
  const ghostShell = await page.locator('.ide-shell').count()
  const ghostDrawer = await page.locator('[data-testid="ide-briefing-drawer"]').count()
  record('幽灵任务深链不崩溃', ghostShell > 0 && ghostDrawer === 0, `shell=${ghostShell} drawer=${ghostDrawer}`)

  // 7. 自检弹层（命令面板入口）
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(500)
  await page.keyboard.type('自检')
  await page.waitForTimeout(400)
  const selfCheckZh = page.getByText('IDE 自检（全能力冒烟）', { exact: true }).first()
  const selfCheckEn = page.getByText('IDE self-check (full smoke)', { exact: true }).first()
  const selfCheckCmd = (await selfCheckZh.count()) ? selfCheckZh : selfCheckEn
  if (await selfCheckCmd.count()) {
    await selfCheckCmd.click()
    await waitText(page, '[data-testid="ide-selfcheck-summary"]', 25_000)
    const summary = await page.locator('[data-testid="ide-selfcheck-summary"]').innerText().catch(() => '')
    const dialog = (await page.locator('[data-testid="ide-selfcheck"]').count()) > 0
    record('自检弹层可运行', dialog && /通过/.test(summary), summary)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    record('自检弹层 Esc 关闭', (await page.locator('[data-testid="ide-selfcheck"]').count()) === 0)
  } else {
    record('自检弹层可运行', false, '命令入口缺失')
  }

  // 8. 页面无未捕获错误
  record('无未捕获页面错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

  await page.screenshot({ path: join(OUT, 'final.png') })
} catch (err) {
  record('冒烟脚本执行', false, err instanceof Error ? err.message : String(err))
  await page.screenshot({ path: join(OUT, 'failure.png') }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter(r => !r.ok)
console.log(`\nIDE smoke: ${results.length - failed.length}/${results.length} passed; evidence: ${OUT}`)
process.exit(failed.length ? 1 : 0)
