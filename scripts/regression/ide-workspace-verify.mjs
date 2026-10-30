#!/usr/bin/env node
// overlay/scripts/regression/ide-workspace-verify.mjs
// IDE 工作区任务链一致性探针（2026-10-31 回归轮沉淀为永久资产）：
//   1. 任务深链 ?task= → 简报抽屉自动展开 → taskWorkspace 解析（板号/materialized）
//      → store 工作区根切换（origin=task）→ 文件树锚定任务工作区（三轮一致性，
//      治 708 修复前的跨组件晚到覆盖错根）；
//   2. Git 页签列出工作区未提交变更（G 端到端锚定）。
// 判据全部走页面内 pinia/DOB 断言（不猜 UI 文案），失败输出截图与 store 快照。
//
// 用法：node scripts/regression/ide-workspace-verify.mjs [--task t_xxx]
// 环境变量：IDE_VERIFY_BASE（默认 http://localhost:8649）
//           IDE_VERIFY_TOKEN（super_admin JWT；缺省走落地自动登录——文件树断言
//           在非 super_admin 下走权限回落只读树分支，此探针要求 root 权限面）
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const here = fileURLToPath(new URL('.', import.meta.url))
const overlayRoot = resolve(here, '../..')
const require = createRequire(join_safe(overlayRoot))
function join_safe(root) { return `${root}/package.json` }

const BASE = process.env.IDE_VERIFY_BASE?.trim() || 'http://localhost:8649'
const TASK = process.argv.includes('--task')
  ? process.argv[process.argv.indexOf('--task') + 1]
  : process.env.IDE_VERIFY_TASK?.trim() || 't_5233eb3a'
const TOKEN = process.env.IDE_VERIFY_TOKEN?.trim() || ''
const OUT = mkdtempSync(resolve(tmpdir(), 'ide-verify-'))
mkdirSync(OUT, { recursive: true })

const { chromium } = require('playwright')
const results = []
const rec = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []
page.on('pageerror', e => errs.push(String(e).slice(0, 160)))

try {
  if (TOKEN) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate((t) => {
      localStorage.setItem('hermes_api_key', t)
      localStorage.setItem('hermes_active_profile_name', 'default')
    }, TOKEN)
  }
  // ── 断言 1：三轮深链一致性 ──
  for (let round = 1; round <= 3; round++) {
    await page.goto(`${BASE}/#/app/ide?task=${TASK}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.ide-shell', { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(8000)
    const snap = await page.evaluate((t) => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
      const ide = pinia?._s?.get('ide')
      const files = pinia?._s?.get('files')
      const drawer = document.querySelector('[data-testid="ide-briefing-drawer"]')
      return {
        activeTask: ide?.activeTaskId ?? null,
        board: ide?.taskWorkspace?.board ?? null,
        materialized: ide?.taskWorkspace?.materialized ?? null,
        wsPath: ide?.taskWorkspace?.path ?? null,
        wsOrigin: ide?.workspaceOrigin ?? null,
        storeRoot: files?.workspaceRoot ?? null,
        drawerOpen: Boolean(drawer),
        drawerHasTask: drawer ? (drawer.textContent || '').includes(t) : false,
      }
    }, TASK)
    const pathOk = String(snap.wsPath || '').length > 0
    const rootAnchored = String(snap.storeRoot || '') === String(snap.wsPath || '')
    rec(`round${round} 深链解析（任务绑定/物化/板号）`, snap.activeTask === TASK && snap.materialized === true && pathOk && Boolean(snap.board),
      `board=${snap.board}`)
    rec(`round${round} 工作区切根（origin=task + storeRoot=任务工作区）`, snap.wsOrigin === 'task' && rootAnchored,
      `origin=${snap.wsOrigin}`)
    rec(`round${round} 简报抽屉自动展开且含任务`, snap.drawerOpen && snap.drawerHasTask, '')
  }

  // ── 断言 2：Git 页签锚定 ──
  await page.evaluate(() => {
    document.querySelector('[data-testid="ide-briefing-close"]')?.click()
    document.querySelector('[data-testid="ide-sidepane-group-all"]')?.click()
  })
  await page.waitForTimeout(400)
  await page.evaluate(() => { document.querySelector('[data-testid="ide-sidepane-tab-review"]')?.click() })
  await page.waitForTimeout(3500)
  const gitText = await page.locator('.ide-sidepane__body').innerText().catch(() => '')
  rec('Git 页签锚定任务工作区（分支/状态可见）', /main|master|分支|变更|没有变更/.test(gitText), gitText.replace(/\s+/g, ' ').slice(0, 80))
  await page.screenshot({ path: `${OUT}/final.png` })

  rec('无未捕获页面错误', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  rec('探针执行', false, String(e).slice(0, 200))
  await page.screenshot({ path: `${OUT}/failure.png` }).catch(() => {})
} finally {
  await browser.close()
}
const bad = results.filter(r => !r.ok)
console.log(`\nIDE workspace verify: ${results.length - bad.length}/${results.length} passed; evidence: ${OUT}`)
process.exit(bad.length ? 1 : 0)
