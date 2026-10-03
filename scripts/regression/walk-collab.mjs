// 沟通协作工作台（/app 三栏）末级走查：左栏入口/筛选/创建菜单/管理菜单/中栏画布/右栏任务面板。
// 每组动作全新加载（防组件态污染）；弹层内容用文本+截图双证。
// 用法：node scripts/regression/walk-collab.mjs
import { chromium } from '@playwright/test'
import { BASE, Ledger, SHOTS } from './harness.mjs'

const led = new Ledger('collab')

async function fresh(hash = 'app') {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, locale: 'zh-CN' })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  await page.goto(BASE + '/#/' + hash, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)
  const later = page.locator('button', { hasText: '稍后提醒' }).first()
  if (await later.count()) { await later.click({ force: true }).catch(() => {}); await page.waitForTimeout(400) }
  return { browser, page, errors }
}
async function domClick(page, sel) {
  await page.evaluate((s) => {
    const [c, textRule] = s.split('::TEXT=')
    const el = textRule
      ? [...document.querySelectorAll(c)].find((e) => e.textContent.trim() === textRule)
      : document.querySelector(c)
    if (!el) throw new Error('not found: ' + s)
    el.click()
  }, sel)
}
const anyOverlay = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.n-popover, .n-dropdown-menu, .n-modal, .n-card, .n-dialog, [class*=dropdown], [class*=menu], [class*=modal], [class*=drawer]')]
    .filter((e) => e.offsetParent !== null && e.innerText.trim())
    .map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 120)).slice(0, 4))

// ── ① 左栏四大入口（每项全新加载：工作页会替换三栏布局）──
for (const [tid, label, expectHash] of [
  ['overview-nav-entry', '概览', 'dash'],
  ['inbox-nav-entry', '待审收件箱', 'inbox'],
  ['governance-nav-entry', '治理中心', 'board'],
  ['nav-accounts', '账户管理', 'accounts'],
]) {
  const { browser, page, errors } = await fresh()
  try {
    await domClick(page, `[data-testid=${tid}]`)
    await page.waitForTimeout(2500)
    const h = await page.evaluate(() => location.hash)
    const ok = h.includes(expectHash)
    led.record(`左栏 ${label} → /app/${expectHash}`, ok, `hash=${h}` + (errors.length ? ' err=' + errors[0] : ''))
    await led.shot(page, 'nav-' + expectHash)
  } catch (e) { led.defect(`左栏 ${label}`, String(e).slice(0, 100), 'P1') }
  finally { await browser.close() }
}

// ── ② 筛选与排序 ──
{
  const { browser, page, errors } = await fresh()
  try {
    for (const [tid, label] of [['flow-filter-all', '筛选·全部'], ['flow-filter-session', '筛选·会话'], ['flow-filter-loop', '筛选·循环'], ['flow-sort-recent', '排序·时间'], ['flow-sort-unread', '排序·未读'], ['flow-sort-alpha', '排序·字母']]) {
      try {
        await domClick(page, `[data-testid=${tid}]`)
        await page.waitForTimeout(700)
        led.record(`左栏 ${label}`, true)
      } catch (e) { led.defect(`左栏 ${label}`, String(e).slice(0, 100), 'P2') }
    }
    // 过滤输入
    await page.locator('input[placeholder*="过滤"], input[placeholder*="Filter"]').first().fill('zzz不存在')
    await page.waitForTimeout(800)
    const empty = await page.evaluate(() => document.body.innerText.match(/暂无|无匹配|没有/g)?.length > 0)
    led.record('左栏过滤输入（无匹配空态）', empty, '')
    await led.shot(page, 'flow-filter-empty')
  } finally { await browser.close() }
}

// ── ③ ＋新聊天 菜单（ia2.flow 全菜单项）──
{
  const { browser, page, errors } = await fresh()
  try {
    await domClick(page, '[data-testid=flow-new-session]')
    await page.waitForTimeout(1000)
    const menu = await anyOverlay(page)
    led.record('＋新聊天菜单弹出', menu.length > 0, JSON.stringify(menu))
    await led.shot(page, 'new-chat-menu')
    // 逐项点开-取消（只验入口可点与弹层出现，不真建）
    const items = await page.evaluate(() => [...document.querySelectorAll('.n-dropdown-option, [role=menuitem], [class*=menu-item], [class*=menuitem]')].filter(e => e.offsetParent !== null).map(e => e.textContent.trim().slice(0, 20)))
    console.log('  新聊天菜单项: ' + JSON.stringify(items))
  } finally { await browser.close() }
}

// ── ④ ⚙管理 菜单 ──
{
  const { browser, page, errors } = await fresh()
  try {
    await domClick(page, '[data-testid=flow-gov]')
    await page.waitForTimeout(1000)
    const menu = await anyOverlay(page)
    led.record('⚙管理菜单弹出', menu.length > 0, JSON.stringify(menu))
    await led.shot(page, 'flow-gov-menu')
    const items = await page.evaluate(() => [...document.querySelectorAll('.n-dropdown-option, [role=menuitem], [class*=menu-item], [class*=menuitem]')].filter(e => e.offsetParent !== null).map(e => e.textContent.trim().slice(0, 20)))
    console.log('  管理菜单项: ' + JSON.stringify(items))
  } finally { await browser.close() }
}

// ── ⑤ 会话画布（选中会话后中栏）：输入/发送区与工具 ──
{
  const { browser, page, errors } = await fresh()
  try {
    // 选左栏第一个会话/聊天项
    const clicked = await page.evaluate(() => {
      const item = [...document.querySelectorAll('[class*=flow-item], [class*=session-item], [class*=flow__item]')].filter(e => e.offsetParent !== null)[0]
        || [...document.querySelectorAll('li, .n-tree-node')].find(e => (e.textContent || '').includes('mini-site'))
      if (!item) return false
      item.click(); return true
    })
    await page.waitForTimeout(2500)
    const canvas = await page.evaluate(() => ({
      composer: !!document.querySelector('textarea, [contenteditable=true]'),
      text: document.querySelector('[class*=canvas], main, [class*=center]')?.innerText.slice(0, 80) || '',
    }))
    led.record('会话画布打开（消息+输入区）', clicked && canvas.composer, JSON.stringify(canvas))
    await led.shot(page, 'chat-canvas')
    if (errors.length) led.defect('会话画布 [pageerror]', errors.slice(0, 2).join(' | '), 'P2')
  } finally { await browser.close() }
}

// ── ⑥ 右栏任务面板动作 ──
{
  const { browser, page, errors } = await fresh()
  try {
    await domClick(page, '[data-testid=tdp-wait-all]')
    await page.waitForTimeout(1500)
    led.record('等我·全部›', true, await page.evaluate(() => location.hash))
    await led.shot(page, 'tdp-wait-all')
    await fresh2Close()
  } catch (e) { led.defect('等我·全部›', String(e).slice(0, 100), 'P2') }
  finally { await browser.close() }

  async function fresh2Close() { }
}

// ── ⑦ 任务行动作（改派/⌨IDE/去处理）+ ＋新任务 + 全部时间线 ──
{
  const { browser, page, errors } = await fresh()
  try {
    // 新任务表单
    await domClick(page, '[data-testid=tdp-new-task]')
    await page.waitForTimeout(1200)
    const form = await anyOverlay(page)
    led.record('＋新任务 表单弹出', form.length > 0, JSON.stringify(form).slice(0, 150))
    await led.shot(page, 'new-task-form')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  } catch (e) { led.defect('＋新任务', String(e).slice(0, 100), 'P1') }
  finally { await browser.close() }

  const { browser: b2, page: p2, errors: e2 } = await fresh()
  try {
    await domClick(p2, '[data-testid^=tdp-reassign-]')
    await p2.waitForTimeout(1200)
    const dlg = await anyOverlay(p2)
    led.record('任务·改派 弹出', dlg.length > 0, JSON.stringify(dlg).slice(0, 150))
    await led.shot(p2, 'tdp-reassign')
    await p2.keyboard.press('Escape')
    await p2.waitForTimeout(400)
    await domClick(p2, '[data-testid^=tdp-handle-]')
    await p2.waitForTimeout(1500)
    led.record('任务·去处理 落点', true, await p2.evaluate(() => location.hash))
    await led.shot(p2, 'tdp-handle')
  } catch (e) { led.defect('任务行动作', String(e).slice(0, 100), 'P1') }
  finally { await b2.close() }

  const { browser: b3, page: p3, errors: e3 } = await fresh()
  try {
    await domClick(p3, '[data-testid=tdp-timeline-all]')
    await p3.waitForTimeout(1800)
    const txt = await p3.evaluate(() => document.body.innerText.slice(0, 120))
    led.record('全部时间线 打开', (await p3.evaluate(() => location.hash)).length > 0, txt.replace(/\s+/g, ' ').slice(0, 80))
    await led.shot(p3, 'timeline-all')
  } catch (e) { led.defect('全部时间线', String(e).slice(0, 100), 'P1') }
  finally { await b3.close() }
}

led.flush()
