// 顶栏逐项隔离重测：每项全新加载（防弹层/组件态污染），验证开合与内容。
// 用法：node scripts/regression/walk-header2.mjs
import { chromium } from '@playwright/test'
import { BASE, Ledger, SHOTS } from './harness.mjs'

const led = new Ledger('header2')

async function fresh() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, locale: 'zh-CN' })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  await page.goto(BASE + '/#/app', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)
  // 默认口令弹窗：点「稍后提醒」
  const later = page.locator('button', { hasText: '稍后提醒' }).first()
  if (await later.count()) { await later.click({ force: true }).catch(() => {}) ; await page.waitForTimeout(500) }
  return { browser, page, errors }
}

async function panelText(page) {
  return page.evaluate(() => [...document.querySelectorAll('.n-popover, .n-dropdown-menu, .n-drawer, .n-modal, .n-card, [class*=popover], [class*=dropdown], [class*=panel]')]
    .filter(e => e.offsetParent !== null)
    .map(e => e.innerText.trim().slice(0, 100)).filter(Boolean).slice(0, 4))
}

// ── ① 日程弹层：开 → Esc → 重开 → ✕ ──
{
  const { browser, page, errors } = await fresh()
  try {
    await page.locator('[data-testid=ia-header-schedule]').click()
    await page.waitForTimeout(1200)
    const open1 = await page.evaluate(() => document.body.innerText.includes('添加待办'))
    await led.shot(page, 'sched-open')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    const afterEsc = await page.evaluate(() => document.body.innerText.includes('添加待办'))
    led.record('日程弹层 Esc 关闭', open1 && !afterEsc, `open=${open1} afterEsc=${afterEsc}`)
    if (afterEsc) {
      // 尝试 ✕ 关闭
      const closed = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')].filter(b => (b.textContent || '').trim() === '✕' || b.getAttribute('aria-label')?.includes('关闭') || b.className.includes('close'))
        btns[btns.length - 1]?.click()
        return btns.length
      })
      await page.waitForTimeout(800)
      const afterX = await page.evaluate(() => document.body.innerText.includes('添加待办'))
      led.record('日程弹层 ✕ 关闭', !afterX, `closeBtns=${closed} afterX=${afterX}`)
      await led.shot(page, 'sched-after-close')
    }
  } finally { await browser.close() }
}

// ── ② 通知面板 ──
{
  const { browser, page, errors } = await fresh()
  try {
    await page.locator('[data-testid=ia-header-notify]').click()
    await page.waitForTimeout(1500)
    const p = await panelText(page)
    led.record('通知面板弹出', p.length > 0, JSON.stringify(p))
    await led.shot(page, 'notify-open')
  } finally { await browser.close() }
}

// ── ③ 在线面板 ──
{
  const { browser, page, errors } = await fresh()
  try {
    await page.locator('[data-testid=sit-online]').click()
    await page.waitForTimeout(1500)
    const p = await panelText(page)
    led.record('在线面板弹出', p.length > 0, JSON.stringify(p))
    await led.shot(page, 'online-open')
  } finally { await browser.close() }
}

// ── ④ 用户菜单 ──
{
  const { browser, page, errors } = await fresh()
  try {
    await page.locator('[data-testid=ia-header-user]').click()
    await page.waitForTimeout(1200)
    const p = await panelText(page)
    led.record('用户菜单弹出', p.length > 0, JSON.stringify(p))
    await led.shot(page, 'user-menu')
  } finally { await browser.close() }
}

// ── ⑤ 视图切换 → IDE ──
{
  const { browser, page, errors } = await fresh()
  try {
    await page.locator('[data-testid=ia-view-toggle]').click()
    await page.waitForTimeout(3000)
    const h = await page.evaluate(() => location.hash)
    const hasIdeSidebar = await page.evaluate(() => !!document.querySelector('[class*=ide]'))
    led.record('视图切换到 IDE', h.includes('ide') && hasIdeSidebar, `hash=${h} ideCls=${hasIdeSidebar}`)
    await led.shot(page, 'ide-view')
    if (errors.length) led.defect('视图切换 [pageerror]', errors.slice(0, 2).join(' | '), 'P2')
  } finally { await browser.close() }
}

// ── ⑥ 注意力条 chip ──
{
  const { browser, page, errors } = await fresh()
  try {
    const chips = await page.evaluate(() => {
      const bar = document.querySelector('[class*=attn]')
      if (!bar) return { found: 0, html: 'no attn bar' }
      const items = [...bar.querySelectorAll('button, a, [class*=item], [class*=chip]')].filter(e => e.offsetParent !== null)
      return { found: items.length, sample: items.slice(0, 3).map(e => (e.textContent || '').trim().slice(0, 30)), cls: bar.className }
    })
    led.record('注意力条 chip 枚举', chips.found > 0, JSON.stringify(chips).slice(0, 200))
    if (chips.found > 0) {
      await page.evaluate(() => {
        const bar = document.querySelector('[class*=attn]')
        const items = [...bar.querySelectorAll('button, a, [class*=item], [class*=chip]')].filter(e => e.offsetParent !== null)
        items[1]?.click() || items[0]?.click()
      })
      await page.waitForTimeout(1500)
      await led.shot(page, 'attn-chip-click')
    }
  } finally { await browser.close() }
}

led.flush()
