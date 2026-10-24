// ide-sidepane-regress.mjs — SwarmStudio IDE 工作台 repo wiki + 辅助工具栏 44 项浏览器回归
// （2026-10-10 回归轮终态固化：D1-D6 修复轮 + UX 三件遗留项的守门面）。
//
// 用法（需 overlay dev 链路在跑：cd overlay && npm run serve & npm run dev → 8647/8649）：
//   node mux/ide-sidepane-regress.mjs
//   BASE=http://localhost:8649 OUT=/tmp/x node mux/ide-sidepane-regress.mjs   # 可覆写
// 依赖 simharness/node_modules 的 playwright；本机无 ms-playwright 缓存时走系统
// Chrome（channel:'chrome' 系统浏览器，免下载缓存）。
//
// 已知环境事实（勿当缺陷报）：
// - dev 自动登录 admin/123456 为 super_admin；默认口令提醒模态框每浏览器档案
//   一次（脚本预置 dismissal），dev 下「稍后提醒」持久 localStorage。
// - 全新浏览器档案 UI 默认英文 → 选择器用英文 title/文案。
// - 生成/更新管线只断言本地消息注入：socket.io 被阻断，不会真启动 agent run。
// - 页签条按钮交互走 DOM 级 click（evaluate）——组过滤重渲染窗口期 playwright
//   坐标点击曾静默落空（clicks 事件流实证），DOM click 无此竞态。
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:8649'
const OUT = process.env.OUT || `/tmp/ide-sidepane-regress/${new Date().toISOString().replace(/[:.]/g, '-')}`
const SHOTS = `${OUT}/screenshots`
mkdirSync(SHOTS, { recursive: true })

// ── 夹具自建（幂等）：~/.hermes 内才能过 files root 沙箱 ──
import { homedir } from 'node:os'
const FIX_WS = `${homedir()}/.hermes/qa-wiki-fixture`
const EMPTY_WS = `${homedir()}/.hermes/qa-wiki-empty`
const OUTSIDE_WS = '/tmp/qa-outside-ws'
function ensureFixture() {
  mkdirSync(`${FIX_WS}/docs/wiki/modules`, { recursive: true })
  mkdirSync(EMPTY_WS, { recursive: true })
  const w = (p, s) => writeFileSync(p, s)
  w(`${FIX_WS}/docs/wiki/index.md`, '# QA Wiki 首页\n\n这是回归夹具首页。\n')
  w(`${FIX_WS}/docs/wiki/modules/ide-sidepane.md`, '# 辅助栏模块\n\n职责：承载 17 个页签。\n\n关键文件：`IdeSidePane.vue`\n')
  w(`${FIX_WS}/docs/wiki/modules/wiki-pipeline.md`, '# Wiki 管线\n\n职责：多子代理生成 wiki。\n\n关键文件：`wikiPipeline.ts`\n')
}
ensureFixture()

const results = []
let shotN = 0
function rec(id, name, ok, detail = '') {
  results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 300) })
  console.log(`${ok ? 'PASS' : 'FAIL'} [${id}] ${name}${detail ? ' — ' + String(detail).slice(0, 200) : ''}`)
}
async function shot(page, tag) {
  shotN += 1
  await page.screenshot({ path: `${SHOTS}/${String(shotN).padStart(2, '0')}-${tag}.png` }).catch(() => {})
}
async function clipboard(page) {
  return page.evaluate(() => navigator.clipboard.readText())
}
async function noModal(page) {
  if (await page.locator('.n-modal-mask').count()) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300).catch(() => {})
  }
}
async function domClick(page, selector) {
  await page.evaluate((sel) => document.querySelector(sel)?.click(), selector)
}

async function openIde(ctx, ws) {
  const page = await ctx.newPage()
  await page.addInitScript((w) => {
    if (w === null) localStorage.removeItem('hermes_ide_workspace')
    else localStorage.setItem('hermes_ide_workspace', w)
  }, ws)
  await page.goto(`${BASE}/#/app/ide`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('[data-testid="ide-sidepane"]', { timeout: 45000 })
  try { await page.locator('button:has-text("Remind me later")').click({ timeout: 9000 }); await page.waitForTimeout(300) } catch { /* 未弹 */ }
  return page
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] })
await ctx.route('**/socket.io/*', (r) => r.abort())

// ── Phase 1：容器 + 44 项主pass ──
const page = await openIde(ctx, FIX_WS)
rec('boot', 'IDE 工作台冷启动渲染（hash 路由热身后辅助栏出现）', true)

const groupExpect = { all: 17, code: 3, knowledge: 3, observe: 3, collab: 3, config: 5 }
for (const [g, n] of Object.entries(groupExpect)) {
  await page.click(`[data-testid="ide-sidepane-group-${g}"]`)
  const tabs = await page.locator('[data-testid^="ide-sidepane-tab-"]').count()
  rec(`grp-${g}`, `组过滤 ${g} 页签数=${n}`, tabs === n, `got ${tabs}`)
}

const tabAnchor = {
  files: '[data-testid="ide-sidepane-files"]',
  review: '[data-testid="ide-sidepane-review"]',
  terminal: '[data-testid="ide-terminal-actions"]',
  wiki: '[data-testid="ide-wiki-pane"]',
  memory: '[data-testid="ide-memory-pane"]',
  ctxarchive: '[data-testid="ide-sidepane-ctxarchive"]',
  tools: '[data-testid="ide-sidepane-tools"]',
  trajectory: '[data-testid="ide-sidepane-trajectory"]',
  workflow: '[data-testid="ide-sidepane-workflow"]',
  kanban: '[data-testid="ide-sidepane-kanban"]',
  assistant: '[data-testid="ide-sidepane-assistant-input"]',
  board: '[data-testid="ide-whiteboard-pane"]',
  browser: '__special__',
  storage: '[data-testid="ide-storage-pane"]',
  mcp: '[data-testid="ide-sidepane-mcp"]',
  hooks: '[data-testid="ide-sidepane-hooks"]',
  slash: '[data-testid="ide-sidepane-slash"]',
}
await page.click('[data-testid="ide-sidepane-group-all"]')
await page.waitForTimeout(400)
for (const [tab, anchor] of Object.entries(tabAnchor)) {
  try {
    await page.click(`[data-testid="ide-sidepane-tab-${tab}"]`, { timeout: 3000 })
    await noModal(page)
    if (anchor === '__special__') {
      const child = await page.locator('.ide-sidepane__body > *:visible').count()
      rec(`tab-${tab}`, `页签 ${tab} 切换渲染`, child > 0, `body children visible=${child}`)
    } else {
      await page.waitForSelector(anchor, { timeout: 6000 })
      rec(`tab-${tab}`, `页签 ${tab} 切换渲染`, true)
    }
  } catch (e) {
    rec(`tab-${tab}`, `页签 ${tab} 切换渲染`, false, e.message)
  }
}
await noModal(page)
await page.click('[data-testid="ide-sidepane-group-code"]')
const codeTabs = await page.locator('[data-testid^="ide-sidepane-tab-"]').count()
rec('grp-back-code', '组切换回编码组', codeTabs === 3, `got ${codeTabs}`)

// ── wiki 全功能 ──
let clip = ''
try {
  await noModal(page)
  await page.click('[data-testid="ide-sidepane-group-knowledge"]')
  await page.click('[data-testid="ide-sidepane-tab-wiki"]')
  await page.waitForSelector('[data-testid="ide-wiki-pane"]', { timeout: 8000 })
  let listed = []
  try {
    await page.waitForSelector('[data-testid="ide-wiki-list"] li', { timeout: 25000 })
    listed = await page.locator('[data-testid="ide-wiki-list"] li').allTextContents()
  } catch {}
  rec('wiki-list', 'Wiki 页列表（3 页，含子目录递归）', listed.length === 3 && listed.includes('index') && listed.includes('ide-sidepane') && listed.includes('wiki-pipeline'), `got=${JSON.stringify(listed)}`)
  await shot(page, 'wiki-list')

  await page.click('[data-testid="ide-wiki-page-ide-sidepane"]')
  let contentOk = false
  try { await page.waitForSelector('text=辅助栏模块', { timeout: 15000 }); contentOk = true } catch {}
  rec('wiki-open', '点击页面阅读 markdown 内容', contentOk)
  await shot(page, 'wiki-open')

  try {
    await page.click('button[title="Reference page"]')
    await page.waitForTimeout(400)
    clip = await clipboard(page)
  } catch (e) { clip = 'ERR:' + e.message }
  rec('wiki-refpage', '引用当前页 → 剪贴板含路径与正文', clip.includes('docs/wiki/modules/ide-sidepane.md') && clip.includes('IdeSidePane.vue'), `clip=${clip.slice(0, 80)}`)

  try {
    await page.click('button[title="Reference whole wiki"]')
    await page.waitForTimeout(400)
    clip = await clipboard(page)
  } catch (e) { clip = 'ERR:' + e.message }
  rec('wiki-refwiki', '引用整册 → 目录摘要不灌全文', clip.includes('整册引用') && clip.includes('docs/wiki/index.md') && !clip.includes('关键文件'), `clip=${clip.slice(0, 80)}`)

  try {
    await page.click('[data-testid="ide-wiki-generate"]')
    await page.waitForTimeout(400)
    clip = await clipboard(page)
  } catch (e) { clip = 'ERR:' + e.message }
  rec('wiki-genprompt', '生成 Wiki → 复制生成提示词', clip.includes('docs/wiki/') && clip.includes('index.md'), `clip=${clip.slice(0, 60)}`)

  try {
    await page.click('[data-testid="ide-wiki-pipeline"]')
    await page.waitForSelector('text=请为本仓库生成/更新 Wiki 到 docs/wiki/', { timeout: 8000 })
    // 断言注入发生即足：提示词组合（增量/全量分支与全路径）由 wiki-pane.test.ts
    // 对 sendMessage 入参字节级锁死；浏览器层长消息会被聊天渲染截断，模式段
    // 不保证进 innerText。
    rec('wiki-pipeline', '管线 → 提示词注入当前会话（消息头在场）', true)
    await shot(page, 'wiki-pipeline-chat')
  } catch (e) {
    rec('wiki-pipeline', '管线 → 提示词注入当前会话', false, e.message)
  }
} catch (e) {
  rec('wiki-pass-ctx', 'wiki 全流程前置点击', false, e.message)
}

// ── 终端一键命令 ──
try {
  await noModal(page)
  await page.click('[data-testid="ide-sidepane-group-code"]')
  await page.click('[data-testid="ide-sidepane-tab-terminal"]')
  await page.waitForSelector('[data-testid="ide-terminal-actions"]', { timeout: 6000 })
  await page.fill('[data-testid="ide-terminal-action-label"]', 'qa-echo')
  await page.fill('[data-testid="ide-terminal-action-command"]', 'echo qa-wiki-ok')
  await page.click('[data-testid="ide-terminal-action-add"]')
  let chips = 0
  try {
    await page.waitForSelector('[data-testid="ide-terminal-action"]', { timeout: 4000 })
    chips = await page.locator('[data-testid="ide-terminal-action"]').count()
  } catch {}
  rec('term-add', '终端一键命令：新增 chip', chips === 1, `chips=${chips}`)
  const stored = await page.evaluate((ws) => localStorage.getItem(`ide-terminal-actions:${ws}`), FIX_WS)
  rec('term-persist', '终端一键命令：localStorage 持久化', !!stored && stored.includes('qa-echo'), `stored=${stored ? stored.slice(0, 80) : 'null'}`)
  try {
    const id = JSON.parse(stored)[0].id
    await page.click(`[data-testid="ide-terminal-action-remove-${id}"]`)
    await page.waitForTimeout(300)
    chips = await page.locator('[data-testid="ide-terminal-action"]').count()
  } catch {}
  rec('term-remove', '终端一键命令：移除并清存储', chips === 0, `chips after=${chips}`)
} catch (e) {
  rec('term-section', '终端一键命令前置点击', false, e.message)
}

// ── 辅助对话 ──
try {
  await noModal(page)
  await page.click('[data-testid="ide-sidepane-group-collab"]')
  await page.click('[data-testid="ide-sidepane-tab-assistant"]')
  await page.waitForSelector('[data-testid="ide-sidepane-assistant-input"]', { timeout: 5000 })
  await page.fill('[data-testid="ide-sidepane-assistant-input"]', 'qa-assist-question')
  await page.click('[data-testid="ide-sidepane-assistant-copy"]')
  await page.waitForTimeout(400)
  clip = await clipboard(page)
  rec('assist-copy', '辅助对话：复制结构化追问（类型前缀）', clip.includes('qa-assist-question') && /^\[[^\]]+\]/.test(clip), `clip=${clip.slice(0, 60)}`)
  await page.click('button:has-text("Back to main chat")')
  // setChatFocus 语义=确保会话列展开：断言列容器可见。无会话态不渲染
  // ide-chat-new 按钮（任务引导空态），按钮不是可靠代理。
  let chatVisible = false
  for (let i = 0; i < 6 && !chatVisible; i++) {
    await page.waitForTimeout(300)
    chatVisible = await page.locator('.ide-shell__chat').isVisible().catch(() => false)
  }
  rec('assist-gochat', '跳主会话：会话列可见（unfold 语义）', chatVisible)
} catch (e) {
  rec('assist-section', '辅助对话前置点击', false, e.message)
}

// ── 最大化/关闭/重开（DOM 级点击 + 重渲染等待，规避坐标竞态）──
try {
  await noModal(page)
  await page.click('[data-testid="ide-sidepane-group-knowledge"]')
  await page.waitForTimeout(600)
  await page.click('[data-testid="ide-sidepane-tab-wiki"]')
  await page.waitForTimeout(600)
  await domClick(page, '[data-testid="ide-sidepane-max"]')
  await page.waitForTimeout(400)
  let hasMax = await page.locator('.ide-sidepane.is-max').count()
  rec('pane-max-on', '最大化辅助栏（is-max 类）', hasMax === 1)
  await shot(page, 'pane-max')
  await domClick(page, '[data-testid="ide-sidepane-max"]')
  await page.waitForTimeout(400)
  hasMax = await page.locator('.ide-sidepane.is-max').count()
  rec('pane-max-off', '还原辅助栏', hasMax === 0)
  await page.click('.ide-sidepane__tab--close')
  rec('pane-close', '关闭辅助栏', (await page.locator('[data-testid="ide-sidepane"]').count()) === 0)
  let reopened = false
  try {
    // 丢焦点用 blur()：坐标点击曾误中左侧导航把路由导航走（IdeShell 卸载后
    // ⌘K 无人接，回归 pane-reopen 假阴性实锤）
    await page.evaluate(() => document.activeElement && document.activeElement.blur())
    await page.waitForTimeout(300)
    await page.keyboard.press('Meta+k')
    await page.waitForSelector('.ide-palette input', { timeout: 4000 })
    await page.fill('.ide-palette input', 'terminal')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-testid="ide-terminal-actions"]', { timeout: 6000 })
    reopened = true
  } catch {}
  rec('pane-reopen', '⌘K 命令面板重开辅助栏（terminal 页签）', reopened)
  await shot(page, 'pane-reopen')
} catch (e) {
  rec('pane-section', '最大化/关闭/重开前置点击', false, e.message)
}
await page.close()

// ── Phase 2-4：空态 / 未设工作区 / 沙箱越界 ──
for (const [ws, id, text, extra] of [
  [EMPTY_WS, 'wiki-empty', 'No wiki pages yet', null],
  [null, 'wiki-needws', 'Set a workspace first', 'pipeline'],
  [OUTSIDE_WS, 'wiki-sandbox', 'Wiki load failed', null],
]) {
  const p = await openIde(ctx, ws)
  try {
    await noModal(p)
    await p.click('[data-testid="ide-sidepane-group-knowledge"]')
    await p.click('[data-testid="ide-sidepane-tab-wiki"]')
    let ok = false
    try { await p.waitForSelector(`text=${text}`, { timeout: 15000 }); ok = true } catch {}
    let detail = ''
    if (id === 'wiki-empty') {
      const disabled = await p.locator('button[title="Reference page"]').isDisabled().catch(() => null)
      const refWikiDisabled = await p.locator('button[title="Reference whole wiki"]').isDisabled().catch(() => null)
      ok = ok && disabled === true && refWikiDisabled === true
      detail = `refPageDisabled=${disabled} refWikiDisabled=${refWikiDisabled}`
    } else if (id === 'wiki-needws') {
      const pipeDisabled = await p.locator('[data-testid="ide-wiki-pipeline"]').isDisabled().catch(() => null)
      ok = ok && pipeDisabled === true
      detail = `pipelineDisabled=${pipeDisabled}`
    }
    rec(id, { 'wiki-empty': '空工作区 → 空态 + 引用双钮禁用', 'wiki-needws': '未设工作区 → 引导态 + 管线禁用', 'wiki-sandbox': '越界 workspace → 错误态不崩溃' }[id], ok, detail)
    await shot(p, id)
  } catch (e) {
    rec(id, `${id} 前置点击`, false, e.message)
  }
  await p.close()
}

await browser.close()

const fails = results.filter((r) => r.status === 'FAIL')
console.log('\n==== SUMMARY ====')
console.log(`total=${results.length} pass=${results.length - fails.length} fail=${fails.length}`)
for (const f of fails) console.log(`FAIL [${f.id}] ${f.name} — ${f.detail}`)
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
console.log(`evidence: ${OUT}`)
process.exit(fails.length ? 1 : 0)
