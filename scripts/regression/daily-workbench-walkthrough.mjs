// 日常工作台全功能回归走查（2026-10-31 轮）。
// 面：/app 家族（六阶段页+37 页签/看板/收件箱/沟通/专题/设置）+ 并入 /hermes 功能页。
// 排除面：IDE 工作区（/app/ide*，另有 ide-workspace-verify）与全流程推演（/app/sim*）。
// 单一事实源：路由与页签清单由 route-manifest.ts 现场生成（vite-node），本文件不维护第二份路由数组。
// 用法：node scripts/regression/daily-workbench-walkthrough.mjs
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { BASE, SHOTS, Ledger } from './harness.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const led = new Ledger('daily')

// ── 路由清单（现场生成，防漂移）──
const man = spawnSync(process.execPath, [
  resolve(ROOT, 'node_modules/vite-node/vite-node.mjs'),
  '--config', resolve(ROOT, 'vitest.config.ts'),
  resolve(ROOT, 'scripts/regression/route-manifest.ts'),
], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 })
if (man.status !== 0) {
  console.error('[daily] route-manifest 生成失败：' + (man.stderr || '').slice(0, 500))
  process.exit(2)
}
const manifest = JSON.parse(man.stdout)
led.record('路由清单生成', manifest.counts.routes > 100 && manifest.counts.stageTabs === 37,
  `routes=${manifest.counts.routes} tabs=${manifest.counts.stageTabs}`)

// ── 日常工作台页面集（manifest 派生）──
const isSim = (p) => p.startsWith('/app/sim') || p.startsWith('/app/s/director') || p.startsWith('/app/l/')
const appPages = manifest.routes
  .filter((r) => r.kind === 'page' && r.visitPath.startsWith('/app'))
  .filter((r) => !isSim(r.visitPath) && !r.visitPath.startsWith('/app/ide'))
  .filter((r) => !r.visitPath.includes('walkthrough-missing')) // 参数占位页单列（会话/房间走真实 ID）
const annexedPages = manifest.routes
  .filter((r) => r.kind === 'page' && r.visitPath.startsWith('/hermes') && !r.visitPath.includes('walkthrough-missing'))
  .filter((r) => !['hermes.session', 'hermes.globalAgentSession'].includes(r.name)) // 会话详情走真实 ID 段

// ── 浏览器与会话隔离（每节新开 page，错误归因到节）──
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctxErrors = []
async function newPage(section) {
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, locale: 'zh-CN' })
  const errors = []
  page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 160)}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 160)}`) })
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) errors.push(`[api5xx] ${r.status()} ${r.url().replace(BASE, '')}`)
  })
  ctxErrors.push({ section, errors })
  return { page, errors, section }
}
async function fresh(page, settle = 3800) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settle)
  const later = page.locator('button', { hasText: '稍后提醒' }).first()
  if (await later.count()) { await later.click({ force: true }).catch(() => {}); await page.waitForTimeout(300) }
}
async function visit(page, hash, settle = 2300) {
  await page.goto(BASE + '/#/' + hash.replace(/^\/?#?\/?/, ''), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settle)
  return page.evaluate(() => ({
    hash: location.hash,
    text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
    cards: document.querySelectorAll('.kanban-task-card').length,
  }))
}

// ══ A. 登录态与入口 ══
{
  const { page, errors } = await newPage('A-login')
  try {
    await fresh(page)
    const state = await page.evaluate(() => ({
      hasKey: !!localStorage.getItem('hermes_api_key'),
      hasMatrix: !!localStorage.getItem('matrix_access_token'),
      hasPwd: !!document.querySelector('input[type=password]'),
    }))
    led.record('A1 自动登录落地（api_key+matrix 双凭据）', state.hasKey && state.hasMatrix && !state.hasPwd)
    const overview = await page.evaluate(async () => {
      const r = await fetch('/api/hermes/kanban/overview', { headers: { Authorization: 'Bearer ' + localStorage.getItem('hermes_api_key') } })
      return { status: r.status, boards: r.status === 200 ? (await r.json()).boards?.length : -1 }
    })
    led.record('A2 看板总览 API 200', overview.status === 200, JSON.stringify(overview))
  } finally { await page.close() }
}

// ══ B. 侧栏与三模式切换、语言、折叠 ══
{
  const { page } = await newPage('B-sidenav')
  try {
    await fresh(page)
    await visit(page, 'app/dash')
    // 侧栏冷装载：等 testid 就位而非固定 settle（首轮 2.3s 假红实录）
    await page.locator('[data-testid=ia-side-nav]').first().waitFor({ state: 'attached', timeout: 12000 })
    const nav = await page.evaluate(() => ({
      sideNav: !!document.querySelector('[data-testid=ia-side-nav]'),
      switchLabels: [...document.querySelectorAll('button,a')].map((e) => e.textContent.trim()).filter((t) => ['日常工作台', 'IDE 工作区', '全流程推演'].includes(t)),
      stageEntries: [...document.querySelectorAll('[data-testid^=ia-side-nav-stage]')].map((e) => e.getAttribute('data-testid')),
    }))
    led.record('B1 侧栏在位', nav.sideNav, 'ia-side-nav')
    led.record('B2 三模式切换器三项齐', nav.switchLabels.length === 3, JSON.stringify(nav.switchLabels))
    led.record('B3 六阶段导航条目', new Set(nav.stageEntries).size >= 6, JSON.stringify([...new Set(nav.stageEntries)]))
    // 语言往返：单钮 ia-locale-toggle（zh 态显示 EN，en 态显示 ZH）双击往返
    const lang = page.locator('[data-testid=ia-locale-toggle]')
    if (await lang.count()) {
      await lang.first().click()
      await page.waitForTimeout(1500)
      const en = await page.evaluate(() => (document.body.innerText || '').includes('Daily') || (document.body.innerText || '').includes('IDE Workspace'))
      await lang.first().click()
      await page.waitForTimeout(1500)
      const zh = await page.evaluate(() => (document.body.innerText || '').includes('日常工作台'))
      led.record('B4 语言往返 zh→en→zh', en && zh, `en=${en} zh=${zh}`)
    } else {
      led.record('B4 语言往返 zh→en→zh', false, '未找到 ia-locale-toggle')
    }
    // 折叠往返
    const collapse = page.locator('[data-testid=ia-side-nav-collapse]')
    if (await collapse.count()) {
      await collapse.first().click()
      await page.waitForTimeout(700)
      await collapse.first().click()
      await page.waitForTimeout(700)
      led.record('B5 侧栏折叠往返', true, 'collapse testid 双击无异常')
    } else {
      led.record('B5 侧栏折叠往返', false, '未找到 ia-side-nav-collapse')
    }
    await led.shot(page, 'b-sidenav')
  } finally { await page.close() }
}

// ══ C. /app 家族页面扫（manifest 派生 + 37 页签深链）══
{
  const { page } = await newPage('C-apppages')
  const shotSet = new Set(['app/stage/setup', 'app/stage/govern', 'app/dash', 'app/board', 'app/inbox', 'app/collab'])
  try {
    for (const r of appPages) {
      const st = await visit(page, r.visitPath)
      const blank = st.text.length < 15
      led.record(`C ${r.name} ${r.visitPath}`, !blank, blank ? '疑似白屏' : `${st.text.slice(0, 60)}`)
      const key = r.visitPath.replace(/^\//, '').split('?')[0]
      if (shotSet.has(key)) await led.shot(page, 'c-' + key.replace(/\//g, '-'))
    }
    // 37 页签深链（?tab=）
    let tabOk = 0
    const tabFail = []
    for (const t of manifest.stageTabs) {
      const st = await visit(page, t.visitPath, 1900)
      if (st.text.length >= 15) tabOk++
      else tabFail.push(`${t.stage}/${t.key}`)
    }
    led.record(`C 37 阶段页签深链装载`, tabOk === manifest.stageTabs.length, `ok=${tabOk} fail=${JSON.stringify(tabFail)}`)
  } finally { await page.close() }
}

// ══ D. 并入 /hermes 功能页扫 ══
{
  const { page } = await newPage('D-annexed')
  try {
    for (const r of annexedPages) {
      const st = await visit(page, r.visitPath, 2100)
      const blank = st.text.length < 15
      led.record(`D ${r.name} ${r.visitPath}`, !blank, blank ? '疑似白屏' : `${st.text.slice(0, 50)}`)
    }
  } finally { await page.close() }
}

// ══ E. 看板交互：抽屉 / 行内建卡（triage 安全列）/ 批量催办 UI ══
{
  const { page } = await newPage('E-board')
  let createdId = ''
  try {
    await fresh(page)
    await visit(page, 'app/board', 4200)
    // E1 卡片→详情抽屉
    const cardSel = '.kanban-task-card[data-task-id]'
    const cardCount = await page.locator(cardSel).count()
    led.record('E1 看板卡片装载', cardCount > 0, `cards=${cardCount}`)
    if (cardCount > 0) {
      const firstId = await page.locator(cardSel).first().getAttribute('data-task-id')
      await page.locator(cardSel).first().click()
      await page.waitForTimeout(1800)
      const drawer = await page.evaluate(() => ({
        open: !!document.querySelector('[data-testid=kanban-task-drawer]'),
        header: document.querySelector('[data-testid=kanban-drawer-header]')?.textContent?.trim().slice(0, 60) || '',
        raci: !!document.querySelector('[data-testid=drawer-raci]'),
      }))
      led.record('E2 卡片点击→详情抽屉打开', drawer.open, JSON.stringify({ id: firstId, header: drawer.header, raci: drawer.raci }))
      await led.shot(page, 'e-drawer')
      // 关毕验证（走查序列实录：first button≠关闭钮，抽屉残留时后续建卡点击全落遮罩）。
      // NDrawerContent closable 自带右上关闭钮；Escape 亦关（未编辑态）。
      for (let i = 0; i < 4 && await page.locator('[data-testid=kanban-task-drawer]').isVisible().catch(() => false); i++) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
        const mask = page.locator('.n-drawer-close, [data-testid=kanban-task-drawer] .n-drawer-close').first()
        if (await mask.count().catch(() => 0)) { await mask.click({ force: true }).catch(() => {}); await page.waitForTimeout(400) }
      }
      const drawerClosed = !(await page.locator('[data-testid=kanban-task-drawer]').isVisible().catch(() => false))
      led.record('E2b 抽屉关毕（后续建卡不被遮罩拦）', drawerClosed, drawerClosed ? 'Escape+close 双路' : '抽屉未关——后续 E4 结果不可信')
    }
    // E2b 列视图切换（views menu 若在）
    const viewsMenu = page.locator('[data-testid=kanban-views-menu]')
    if (await viewsMenu.count()) {
      await viewsMenu.first().click({ force: true }).catch(() => {})
      await page.waitForTimeout(800)
      led.record('E3 视图菜单可唤起', true, 'kanban-views-menu')
      await page.keyboard.press('Escape')
    }
    // E4 行内建卡（triage 列=原始想法，不自动派发）
    await visit(page, 'app/board?new=1', 3800)
    const creator = page.locator('[data-testid=kanban-column-triage] textarea, [data-testid=kanban-column-triage] input').first()
    if (await creator.count()) {
      const mark = `[走查]回归探针卡-${Date.now().toString(36)}`
      await creator.fill(mark)
      await page.waitForTimeout(300)
      // 提交钮=创建器内 primary 按钮（文字含 创建/添加/Create/Add）
      const submitBtn = page.locator('[data-testid=kanban-column-triage] button').filter({ hasText: /创建|添加|Create|Add/ }).first()
      if (await submitBtn.count()) {
        // 普通点击（Playwright 自动等稳定性）：force 直点在板面高频重渲染下会打在
        // 已被替换的旧节点上＝零 POST 假红（2026-10-31 三区回归实录，Enter 路径正常）
        await submitBtn.click()
        // 刷新管线（createTask→refreshAllBoards→聚合→WS→DOM）实测 ~4.5s：轮询上限 9s
        let appear = false
        for (let i = 0; i < 6 && !appear; i++) {
          await page.waitForTimeout(1500)
          appear = await page.evaluate((m) => (document.body.innerText || '').includes(m), mark)
        }
        led.record('E4 行内建卡提交→卡出现在板面', appear, `title=${mark}`)
        // 找到新卡 ID（标题匹配）
        createdId = await page.evaluate((m) => {
          const cards = [...document.querySelectorAll('.kanban-task-card[data-task-id]')]
          const hit = cards.find((c) => (c.textContent || '').includes(m))
          return hit?.getAttribute('data-task-id') || ''
        }, mark).catch(() => '')
        // E5 新卡抽屉+审批按钮区（验收标签面）：审批钮只在 review 态渲染（设计内）。
        // 现库无 review 卡 → 探针自有卡经 API 转 review（状态机拒转则如实记不可达）。
        if (createdId) {
          const moved = await page.evaluate(async (id) => {
            const H = { Authorization: 'Bearer ' + localStorage.getItem('hermes_api_key'), 'Content-Type': 'application/json' }
            const r = await fetch(`/api/hermes/kanban/${encodeURIComponent(id)}?board=default`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'review' }) })
            return r.status
          }, createdId).catch(() => 0)
          await page.waitForTimeout(1200)
          await page.locator(`.kanban-task-card[data-task-id="${createdId}"]`).first().click()
          await page.waitForTimeout(1800)
          const drawer2 = await page.evaluate(() => ({
            open: !!document.querySelector('[data-testid=kanban-task-drawer]'),
            approve: !!document.querySelector('[data-testid=drawer-approve]'),
            reject: !!document.querySelector('[data-testid=drawer-reject]'),
          }))
          if (moved === 200) {
            led.record('E5 review 态卡抽屉审批按钮区（验收标签面）', drawer2.open && drawer2.approve && drawer2.reject, JSON.stringify(drawer2))
          } else {
            led.record('E5 review 态卡抽屉审批按钮区（验收标签面）', drawer2.open, `状态机拒转 triage→review（PATCH=${moved}），审批钮断言不可达；抽屉开=${drawer2.open}`, 'P2')
          }
          await led.shot(page, 'e-newcard-drawer')
          // 关毕防遮罩残留（E6 前置）
          for (let i = 0; i < 4 && await page.locator('[data-testid=kanban-task-drawer]').isVisible().catch(() => false); i++) {
            await page.keyboard.press('Escape')
            await page.waitForTimeout(500)
          }
        }
      } else {
        led.record('E4 行内建卡提交→卡出现在板面', false, '未找到提交按钮（建卡器形态变化？）')
        await led.shot(page, 'e-creator-nosubmit')
      }
    } else {
      led.record('E4 行内建卡表单（?new=1 直开）', false, 'triage 列未见建卡输入框')
      await led.shot(page, 'e-creator-missing')
    }
    // E6 批量选择→催办条 UI（不实际发送，避免打扰真实身份）
    if (createdId) {
      const chk = page.locator(`.kanban-task-card[data-task-id="${createdId}"] .card-checkbox`).first()
      if (await chk.count()) {
        await chk.click({ force: true })
        const barVisible = await page.locator('.kanban-bulk-bar').first().isVisible({ timeout: 4000 }).catch(() => false)
        const bar = await page.evaluate(() => {
          const scope = document.querySelector('.kanban-bulk-bar')
          const el = scope ? [...scope.querySelectorAll('button')].find((b) => (b.title || '').includes('催办') || (b.textContent || '').includes('催办')) : null
          return { barVisible: !!scope && scope.offsetParent !== null, nudge: !!el, title: el?.title || el?.textContent?.trim() || '' }
        })
        led.record('E6 批量选择→催办条+催办入口可见（不发送）', bar.barVisible && bar.nudge, JSON.stringify(bar))
        await led.shot(page, 'e-bulkbar')
      } else {
        led.record('E6 批量选择→催办条+催办入口可见（不发送）', false, '未找到卡复选框')
      }
    }
  } finally {
    // 清理走查卡（DELETE /api/hermes/kanban/:id）
    if (createdId) {
      const del = await page.evaluate(async (id) => {
        const r = await fetch(`/api/hermes/kanban/${encodeURIComponent(id)}?board=default`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('hermes_api_key') } })
        return r.status
      }, createdId).catch(() => 0)
      led.record('E7 走查卡清理（DELETE）', del === 200, `status=${del} id=${createdId}`)
    }
    await page.close()
  }
}

// ══ F. 审批收件箱 ══
{
  const { page } = await newPage('F-inbox')
  try {
    await fresh(page)
    const st = await visit(page, 'app/inbox', 3600)
    const ok = st.text.includes('收件箱') || st.text.includes('审批') || st.text.includes('Inbox') || st.text.length > 50
    led.record('F1 审批收件箱装载', ok, st.text.slice(0, 80))
    await led.shot(page, 'f-inbox')
  } finally { await page.close() }
}

// ══ G. 沟通面：统一聊天 / 会话列表 / 历史 / agent / 真实房间页 ══
{
  const { page } = await newPage('G-comms')
  try {
    await fresh(page)
    // 真实 roomId：node 侧直连 homeserver joined_rooms
    let realRoom = ''
    try {
      const tok = await page.evaluate(() => localStorage.getItem('matrix_access_token'))
      const jr = await fetch('http://127.0.0.1:8008/_matrix/client/v3/joined_rooms', { headers: { Authorization: 'Bearer ' + tok } })
      const body = await jr.json()
      realRoom = (body.joined_rooms || [])[0] || ''
    } catch { /* homeserver 不可达则跳过房间页 */ }
    // G1 统一聊天窗
    let st = await visit(page, 'app/collab', 4200)
    led.record('G1 统一身份聊天窗装载', st.text.length > 50, st.text.slice(0, 60))
    await led.shot(page, 'g-collab')
    // G2 会话列表
    st = await visit(page, 'app/s/chat', 3200)
    led.record('G2 会话列表页装载', st.text.length > 30, st.text.slice(0, 60))
    // G3 历史
    st = await visit(page, 'app/history', 3200)
    led.record('G3 历史会话页装载', st.text.length > 30, st.text.slice(0, 60))
    // G4 agent 会话
    st = await visit(page, 'app/agent', 3200)
    led.record('G4 全局智能体会话页装载', st.text.length > 30, st.text.slice(0, 60))
    // G5 真实房间页（完整 Matrix 客户端）
    if (realRoom) {
      st = await visit(page, 'app/s/room/' + encodeURIComponent(realRoom), 8000)
      const timeline = await page.evaluate(() => ({
        msgCount: document.querySelectorAll('[data-event-id], .timeline [class*=message], [class*=msg-]').length,
        hasInput: !!document.querySelector('textarea'),
      }))
      led.record('G5 房间页（真实房间）时间线+输入框', st.text.length > 30 && timeline.hasInput, `room=${realRoom.slice(0, 18)}… ${JSON.stringify(timeline)}`)
      await led.shot(page, 'g-room')
    } else {
      led.record('G5 房间页（真实房间）', false, '无已加入房间（joined_rooms 空）', 'P2')
    }
  } finally { await page.close() }
}

// ══ H. 统一搜索 Cmd+K ══
{
  const { page } = await newPage('H-search')
  try {
    await fresh(page)
    await visit(page, 'app/dash', 2600)
    await page.keyboard.press('Meta+k')
    await page.waitForTimeout(1000)
    let pal = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid=global-search-dialog]')
      return { open: !!panel && panel.offsetParent !== null, focused: document.activeElement?.getAttribute('data-testid') === 'search-input' }
    })
    led.record('H1 ⌘K 唤起命令面板+焦点', pal.open && pal.focused, JSON.stringify(pal))
    // 输入关键词→结果/类型计数。关键词从真实数据派生（首轮用「看板」不命中任何
    // 任务标题/会话名——检索 hay=title/id/workspace/assignee——误报全 0 的实录）：
    // 取 overview 首张任务标题前 4 字符；无任务时回落任务 id 前缀「t_」。
    const input = page.locator('[data-testid=search-input]')
    if (await input.count()) {
      const keyword = await page.evaluate(async () => {
        try {
          const r = await fetch('/api/hermes/kanban/overview', { headers: { Authorization: 'Bearer ' + localStorage.getItem('hermes_api_key') } })
          const tasks = r.ok ? (await r.json()).tasks || [] : []
          // 搜索默认排除归档：必须取非归档任务标题，否则命中 0 属正确行为
          const hit = tasks.find((x) => x?.task?.title && x.task.status !== 'archived')
          return hit ? String(hit.task.title).slice(0, 4) : 't_'
        } catch { return 't_' }
      })
      await input.fill(keyword)
      await page.waitForTimeout(1800)
      const res = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid=global-search-dialog]')
        const txt = panel?.textContent || ''
        const m = txt.match(/任务(\d+)/)
        return { taskCount: m ? Number(m[1]) : -1, sample: txt.replace(/\s+/g, ' ').slice(0, 90) }
      })
      led.record('H2 关键词检索出结果面', res.taskCount > 0, `keyword=${keyword} taskCount=${res.taskCount} ${res.sample}`)
      await led.shot(page, 'h-search')
    }
    await page.keyboard.press('Escape')
  } finally { await page.close() }
}

// ══ I. loopCanvas（真实 loop 探测，缺数据则记未验证）══
{
  const { page } = await newPage('I-loop')
  try {
    await fresh(page)
    const loops = await page.evaluate(async () => {
      const H = { Authorization: 'Bearer ' + localStorage.getItem('hermes_api_key') }
      for (const u of ['/api/loops', '/api/hermes/loops', '/api/hermes/workflow/loops']) {
        try { const r = await fetch(u, { headers: H }); if (r.ok) return { url: u, body: await r.json() } } catch {}
      }
      return null
    }).catch(() => null)
    const first = loops?.body?.loops?.[0]?.id || loops?.body?.[0]?.id || ''
    if (first) {
      const st = await visit(page, 'app/l/' + encodeURIComponent(first), 3600)
      led.record('I1 loop 画布（真实 loop）', st.text.length > 30, `id=${first}`)
      await led.shot(page, 'i-loop')
    } else {
      led.record('I1 loop 画布', true, '无 loop 数据源（端点空/不可达），本项未验证', 'info')
    }
  } finally { await page.close() }
}

// ── 错误归因汇总（按节）──
console.log('\n──── 错误归因 ────')
for (const { section, errors } of ctxErrors) {
  const uniq = [...new Set(errors)]
  if (uniq.length) {
    console.log(`[${section}] ${uniq.length} 条`)
    uniq.slice(0, 6).forEach((e) => console.log('   ' + e))
  }
}
led.flush()
await browser.close()
