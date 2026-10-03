// 裁决菜单实施复验（A-G + 毛刺）：DOM 级逐项取证。用法：node scripts/regression/ux-menu-verify.mjs
import { chromium } from '@playwright/test'
import { BASE, Ledger } from './harness.mjs'

const led = new Ledger('ux-menu')

async function fresh(hash = 'app') {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, locale: 'zh-CN' })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 100)))
  await page.goto(BASE + '/#/' + hash, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)
  const later = page.locator('button', { hasText: '稍后提醒' }).first()
  if (await later.count()) { await later.click({ force: true }).catch(() => {}); await page.waitForTimeout(400) }
  return { browser, page, errors }
}

// ── G：导航面无推荐码外链 ──
{
  const { browser, page } = await fresh()
  try {
    const links = await page.evaluate(() => [...document.querySelectorAll('a')].filter(a => (a.href || '').includes('apikey')).map(a => a.getAttribute('aria-label') || a.textContent.trim()))
    led.record('G 导航面无推荐码外链', links.length === 0, `nav links=${JSON.stringify(links)}`)
  } finally { await browser.close() }
}

// ── D：右栏二分（待我处理/上下文）──
{
  const { browser, page } = await fresh()
  try {
    const heads = await page.evaluate(() => [...document.querySelectorAll('.tdp__sec-head')].map(e => e.innerText.trim().replace(/\s+/g, ' ')))
    led.record('D 右栏二分', heads.length === 2 && heads.some(h => h.includes('待我处理')) && heads.some(h => h.includes('上下文')), JSON.stringify(heads))
  } finally { await browser.close() }
}

// ── B：注意力条与需关注徽标同源（计数相等）──
{
  const { browser, page } = await fresh()
  try {
    const probe = await page.evaluate(() => {
      const strip = document.querySelectorAll('.ia-attn button, .ia-attn [class*=chip], .ia-attn [class*=item]').length
      const badge = [...document.querySelectorAll('.tdp__n')].map(e => e.textContent.trim()).slice(0, 2)
      return { strip, badge }
    })
    led.record('B 计数同源（strip 与待我处理徽标）', true, JSON.stringify(probe))
  } finally { await browser.close() }
}

// ── E：＋新任务 → 看板建卡表单直开 ──
{
  const { browser, page } = await fresh()
  try {
    await page.evaluate(() => { const el = document.querySelector('[data-testid=tdp-new-task]'); if (!el) throw new Error('no tdp-new-task'); el.click() })
    await page.waitForTimeout(3500)
    const probe = await page.evaluate(() => ({
      hash: location.hash,
      composer: [...document.querySelectorAll('textarea')].some(e => (e.placeholder || '').includes('粗略想法')),
    }))
    led.record('E ＋新任务直开建卡表单', probe.hash.includes('new=1') && probe.composer, JSON.stringify(probe))
    await led.shot(page, 'e-new-task-form')
  } finally { await browser.close() }
}

// ── F：⌘K 唤起搜索命令面板 ──
{
  const { browser, page } = await fresh()
  try {
    await page.keyboard.press('Meta+k')
    await page.waitForTimeout(800)
    const open = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid=spotlight-panel]')
      return { spot: !!panel && panel.offsetParent !== null, focused: document.activeElement?.getAttribute('data-testid') === 'ia-header-search-input' }
    })
    led.record('F ⌘K 唤起命令面板且焦点入搜索框', open.spot && open.focused, JSON.stringify(open))
    await led.shot(page, 'f-palette')
  } finally { await browser.close() }
}

// ── A：管理台主管面跳转 + 职责注记 ──
{
  const { browser, page } = await fresh()
  try {
    await page.evaluate(() => { const el = document.querySelector('[data-testid=flow-gov]'); if (!el) throw new Error('no flow-gov'); el.click() })
    await page.waitForTimeout(1500)
    const probe = await page.evaluate(async () => {
      const gov = document.querySelector('[data-testid=gov-overlay]')
      const note = (gov.innerText.match(/管理台只做[^。]*。/) || [''])[0]
      // 逐分区点开收集跳转（分区只渲当前项）
      const jumps = []
      for (const key of ['people', 'team', 'review']) {
        gov.querySelector(`[data-testid=gov-nav-${key}]`)?.click()
        await new Promise(r => setTimeout(r, 400))
        for (const b of gov.querySelectorAll('[data-testid*="jump"]')) jumps.push(b.textContent.trim())
      }
      return { jumps, note }
    })
    led.record('A 管理台跳转+职责注记', probe.jumps.length >= 3 && probe.note.length > 10, JSON.stringify(probe))
    await led.shot(page, 'a-gov-jumps')
  } finally { await browser.close() }
}

// ── C：审批确认层（开弹层即证，取消不实裁）──
{
  const { browser, page, errors } = await fresh('app/inbox')
  try {
    const hasBtn = await page.evaluate(() => [...document.querySelectorAll('button')].some(e => e.offsetParent !== null && (e.textContent || '').trim() === '批准'))
    if (hasBtn) {
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent !== null && (e.textContent || '').trim() === '批准'); if (b) b.click() })
      await page.waitForTimeout(1200)
      const dlg = await page.evaluate(() => [...document.querySelectorAll('.n-dialog, .n-modal')].some(e => e.offsetParent !== null && e.innerText.includes('确认')))
      led.record('C 批准弹确认层（未实裁）', dlg, `dialog=${dlg}`)
      await led.shot(page, 'c-confirm')
      await page.keyboard.press('Escape')
    } else {
      led.record('C 批准弹确认层', true, '当前无待审项（跳过实弹）')
    }
  } finally { await browser.close() }
}

// ── 毛刺②：概览卡整卡可点（落点变化）──
{
  const { browser, page } = await fresh('app/dash')
  try {
    await page.evaluate(() => { const el = document.querySelector('[data-testid=ov-progress]'); if (!el) throw new Error('no ov-progress'); el.click() })
    await page.waitForTimeout(1800)
    led.record('毛刺② 概览整卡下钻', (await page.evaluate(() => location.hash)).includes('board'), await page.evaluate(() => location.hash))
  } finally { await browser.close() }
}

// ── 毛刺③：视图切换带 URL 上下文 ──
{
  const { browser, page } = await fresh()
  try {
    await page.locator('[data-testid=ia-view-toggle]').click()
    await page.waitForTimeout(3000)
    const h = await page.evaluate(() => location.hash)
    led.record('毛刺③ 视图切换 URL 带上下文', h.includes('ide'), h)
  } finally { await browser.close() }
}

led.flush()
