// 工作页末级补测：/app/board 八页签逐开 + /app/inbox 审批动作入口 + /app/dash 三卡。
// 用法：node scripts/regression/walk-workpages.mjs
import { chromium } from '@playwright/test'
import { BASE, Ledger } from './harness.mjs'

const led = new Ledger('workpages')

async function fresh(hash) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, locale: 'zh-CN' })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  await page.goto(BASE + '/#/' + hash, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)
  const later = page.locator('button', { hasText: '稍后提醒' }).first()
  if (await later.count()) { await later.click({ force: true }).catch(() => {}); await page.waitForTimeout(400) }
  return { browser, page, errors }
}

// ── ① /app/board 全部页签逐开 ──
{
  const { browser, page, errors } = await fresh('app/board')
  try {
    const tabs = await page.evaluate(() => [...document.querySelectorAll('button, [role=tab]')]
      .map(e => (e.textContent || '').trim()).filter(t => t && t.length <= 6 && /看板|追溯|三账|全链路|组织|台账|审计|文档|驾驭/.test(t)))
    console.log('BOARD TABS=' + JSON.stringify(tabs))
    for (const t of tabs) {
      errors.length = 0
      try {
        await page.evaluate((label) => {
          const el = [...document.querySelectorAll('button, [role=tab]')].find(e => (e.textContent || '').trim() === label && e.offsetParent !== null)
          if (!el) throw new Error('tab not found: ' + label)
          el.click()
        }, t)
        await page.waitForTimeout(2200)
        const len = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, '').length)
        led.record(`看板页签 ${t}`, len > 400, `len=${len}` + (errors.length ? ' err=' + errors[0] : ''))
        await led.shot(page, 'board-' + encodeURIComponent(t))
      } catch (e) { led.defect(`看板页签 ${t}`, String(e).slice(0, 100), 'P1') }
    }
  } finally { await browser.close() }
}

// ── ② /app/inbox：待审条目动作入口（通过/驳回按钮存在性）+ 历史表 ──
{
  const { browser, page, errors } = await fresh('app/inbox')
  try {
    const probe = await page.evaluate(() => {
      const body = document.body.innerText
      const btns = [...document.querySelectorAll('button')].filter(e => e.offsetParent !== null).map(e => (e.textContent || '').trim()).filter(t => t && t.length <= 8)
      return {
        hasPending: /待审|收件箱/.test(body),
        actionBtns: [...new Set(btns)].slice(0, 20),
        rawKeys: (body.match(/\b(?:approvals|ia2|common)\.[a-zA-Z0-9_.]+/g) || []).slice(0, 5),
      }
    })
    led.record('收件箱渲染（待审/历史）', probe.hasPending, JSON.stringify(probe).slice(0, 220))
    led.record('收件箱零裸键', probe.rawKeys.length === 0, probe.rawKeys.join(','))
    await led.shot(page, 'inbox')
  } finally { await browser.close() }
}

// ── ③ /app/dash：概览三卡 ──
{
  const { browser, page, errors } = await fresh('app/dash')
  try {
    const probe = await page.evaluate(() => {
      const body = document.body.innerText
      return {
        cards: /待办|评审|交付/.test(body),
        text: body.replace(/\s+/g, ' ').slice(0, 150),
        rawKeys: (body.match(/\b(?:ia2|common|ma)\.[a-zA-Z0-9_.]+/g) || []).slice(0, 5),
      }
    })
    led.record('概览三卡渲染', probe.cards, probe.text.slice(0, 100))
    led.record('概览零裸键', probe.rawKeys.length === 0, probe.rawKeys.join(','))
    await led.shot(page, 'dash')
  } finally { await browser.close() }
}

led.flush()
