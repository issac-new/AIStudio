// 修复复验（2026-10-03 回归轮）：F1 connections 渲染+冻结级联、F3 日程 Esc、
// F4 更新日志词条、F5 历史路由、F6 在线面板同源。全部 DOM/像素级取证。
// 用法：node scripts/regression/verify-fixes.mjs
import { chromium } from '@playwright/test'
import { BASE, Ledger } from './harness.mjs'

const led = new Ledger('verify-fixes')

async function fresh(hash = 'app') {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, locale: 'zh-CN' })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('C:' + m.text().slice(0, 120)) })
  await page.goto(BASE + '/#/' + hash, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)
  const later = page.locator('button', { hasText: '稍后提醒' }).first()
  if (await later.count()) { await later.click({ force: true }).catch(() => {}); await page.waitForTimeout(400) }
  return { browser, page, errors }
}
const contentLen = (page) => page.evaluate(() => {
  const clone = document.body.cloneNode(true)
  for (const el of clone.querySelectorAll('.studio-navigation-rail, .ia-header, .ia-attn-bar, .ia-lshell__sidebar, header, nav, aside')) el.remove()
  return (clone.innerText || '').replace(/\s+/g, '').length
})

// ── F1 ①：/hermes/connections 渲染（此前整页空白+connectionsExtras 崩）──
{
  const { browser, page, errors } = await fresh()
  try {
    await page.evaluate(() => { location.hash = '#/hermes/connections' })
    await page.waitForTimeout(5000)
    const len = await contentLen(page)
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.n-tabs-tab, [role=tab]')].map(e => e.textContent.trim()))
    const crash = errors.filter(e => e.includes('connectionsExtras'))
    led.record('F1 connections 页渲染（设备 tab 在位）', tabs.length > 0, `contentLen=${len} tabs=${JSON.stringify(tabs)}`)
    led.record('F1 connections 零崩溃', crash.length === 0, crash[0] || '')
    await led.shot(page, 'f1-connections')
  } finally { await browser.close() }
}

// ── F1 ②：冻结级联消失（connections → files 仍可渲染）──
{
  const { browser, page, errors } = await fresh()
  try {
    await page.evaluate(() => { location.hash = '#/hermes/connections' })
    await page.waitForTimeout(4500)
    await page.evaluate(() => { location.hash = '#/hermes/files' })
    await page.waitForTimeout(4500)
    const len = await contentLen(page)
    const cascade = errors.filter(e => e.includes("vnode") || e.includes('parentNode'))
    led.record('F1 冻结级联消失（connections→files）', len > 2000 && cascade.length === 0, `contentLen=${len} cascade=${cascade[0] || ''}`)
  } finally { await browser.close() }
}

// ── F3：日程弹层 Esc 关闭（像素差分）──
{
  const { browser, page } = await fresh()
  try {
    await page.locator('[data-testid=ia-header-schedule]').click()
    await page.waitForTimeout(1500)
    const shotOpen = await page.screenshot()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    const shotEsc = await page.screenshot()
    const same = Buffer.compare(shotOpen, shotEsc) === 0
    led.record('F3 日程弹层 Esc 关闭', !same, same ? 'Esc 后画面零变化' : 'Esc 后画面变化=已关')
    await led.shot(page, 'f3-after-esc')
  } finally { await browser.close() }
}

// ── F4：更新日志词条（不再裸键）──
{
  const { browser, page, errors } = await fresh()
  try {
    await page.locator('[data-testid=ia-header-changelog]').click()
    await page.waitForTimeout(1200)
    const probe = await page.evaluate(() => {
      const modal = [...document.querySelectorAll('.n-modal, .n-card, .n-dialog')].map(e => e.innerText).join('\n')
      return { raw: (modal.match(/changelog\.new_[a-z0-9_]+/g) || []).slice(0, 4), has0727: modal.includes('0.7.27'), sample: modal.slice(0, 200).replace(/\s+/g, ' ') }
    })
    led.record('F4 更新日志零裸键', probe.raw.length === 0, `raw=${JSON.stringify(probe.raw)} | ${probe.sample.slice(0, 80)}`)
    await led.shot(page, 'f4-changelog')
  } finally { await browser.close() }
}

// ── F5：/app/history 零路由错误 ──
{
  const { browser, page, errors } = await fresh('app/history')
  try {
    await page.waitForTimeout(2500)
    // 点第一个历史会话行（若存在）
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('li, [class*=session], [class*=item]')].filter(e => e.offsetParent !== null && /\d{8}_\d{6}/.test(e.textContent || ''))[0]
      row?.click()
    })
    await page.waitForTimeout(2500)
    const noMatch = errors.filter(e => e.includes('No match for'))
    led.record('F5 历史页零 No-match 路由错误', noMatch.length === 0, noMatch[0] || `hash=${await page.evaluate(() => location.hash)}`)
    await led.shot(page, 'f5-history')
  } finally { await browser.close() }
}

// ── F6：在线面板列表与计数同源 ──
{
  const { browser, page, errors } = await fresh()
  try {
    await page.locator('[data-testid=sit-online]').click()
    await page.waitForTimeout(1500)
    const probe = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('.sitp')].find(e => e.offsetParent !== null)
      if (!panel) return { rows: -1, text: 'no panel' }
      const empty = (panel.innerText || '').includes('暂无内容')
      const rows = [...panel.querySelectorAll('*')].filter(e => e.offsetParent !== null && /机器|profile|板/.test(e.textContent||'') && e.children.length<=2).length
      return { rows, empty, text: panel.innerText.slice(0, 150).replace(/\s+/g, ' ') }
    })
    led.record('F6 在线面板非空态（计数>0 时有行）', probe.rows > 0 && !probe.empty, `rows=${probe.rows} empty=${probe.empty} | ${probe.text}`)
    await led.shot(page, 'f6-online')
  } finally { await browser.close() }
}

led.flush()
