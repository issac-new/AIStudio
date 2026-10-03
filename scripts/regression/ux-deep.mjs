// UX 复盘·深挖探针：概览卡下钻/真实任务 chip/管理台行操作/收件箱动作步/需关注点击。
// 只观察不完成破坏性动作（批准类只开确认层即 Esc）。用法：node scripts/regression/ux-deep.mjs
import { chromium } from '@playwright/test'
import { BASE, Ledger } from './harness.mjs'

const led = new Ledger('ux-deep')

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

// ── ① 概览卡：逐卡点击与落点 ──
{
  const { browser, page } = await fresh('app/dash')
  try {
    const cards = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*=card], [class*=dash]')].filter(e => e.offsetParent !== null && e.getBoundingClientRect().width > 150 && e.innerText.trim().length < 60)
      return els.map(e => ({ cls: String(e.className).slice(0, 30), text: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 30), tag: e.tagName }))
    })
    console.log('DASH-ELS=' + JSON.stringify(cards.slice(0, 8)))
    for (let i = 0; i < Math.min(3, cards.length); i++) {
      await page.evaluate((idx) => {
        const els = [...document.querySelectorAll('[class*=card], [class*=dash]')].filter(e => e.offsetParent !== null && e.getBoundingClientRect().width > 150 && e.innerText.trim().length < 60)
        els[idx]?.click()
      }, i)
      await page.waitForTimeout(1500)
      led.record(`概览卡#${i}「${cards[i].text}」落点`, true, `hash=${await page.evaluate(() => location.hash)}`)
    }
  } finally { await browser.close() }
}

// ── ② 真实任务 chip（跳过领头标签）──
{
  const { browser, page } = await fresh()
  try {
    const info = await page.evaluate(() => {
      const bar = document.querySelector('.ia-attn')
      const items = [...bar.querySelectorAll('button, a, [class*=chip], [class*=item]')].filter(e => e.offsetParent !== null && /\[|任务|gap-|修复|评审/.test(e.textContent || ''))
      return items.slice(0, 3).map(e => (e.textContent || '').trim().slice(0, 26))
    })
    await page.evaluate(() => {
      const bar = document.querySelector('.ia-attn')
      const items = [...bar.querySelectorAll('button, a, [class*=chip], [class*=item]')].filter(e => e.offsetParent !== null && /\[|任务|gap-|修复|评审/.test(e.textContent || ''))
      items[0]?.click()
    })
    await page.waitForTimeout(2000)
    led.record('真实任务 chip 点击落点', true, `hash=${await page.evaluate(() => location.hash)} | ${info[0]}`)
    await led.shot(page, 'attn-task-chip')
  } finally { await browser.close() }
}

// ── ③ 管理台行操作：详情/历史 ──
{
  const { browser, page } = await fresh()
  try {
    await page.evaluate(() => document.querySelector('[data-testid=flow-gov]').click())
    await page.waitForTimeout(1500)
    const rows = await page.evaluate(() => {
      const gov = document.querySelector('[data-testid=gov-overlay]')
      const btns = gov ? [...gov.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean) : []
      return [...new Set(btns)].slice(0, 12)
    })
    console.log('GOV-BTNS=' + JSON.stringify(rows))
    // 点行内「详情」
    await page.evaluate(() => {
      const gov = document.querySelector('[data-testid=gov-overlay]')
      const b = [...gov.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '详情')
      b?.click()
    })
    await page.waitForTimeout(1500)
    const detail = await page.evaluate(() => {
      const gov = document.querySelector('[data-testid=gov-overlay]')
      const right = gov ? (gov.innerText.includes('在列表中选择对象查看详情') ? 'still-placeholder' : 'detail-shown') : 'gov-gone'
      return right
    })
    led.record('管理台行「详情」→ 右栏详情', detail === 'detail-shown', detail)
    await led.shot(page, 'gov-detail')
  } finally { await browser.close() }
}

// ── ④ 收件箱动作步（批准 → 确认层观察 → Esc）──
{
  const { browser, page } = await fresh('app/inbox')
  try {
    const btns = await page.evaluate(() => [...document.querySelectorAll('button')].filter(e => e.offsetParent !== null && /批准|打回|通过|驳回/.test((e.textContent || '').trim())).map(e => (e.textContent || '').trim()))
    led.record('收件箱动作按钮枚举', btns.length > 0, JSON.stringify([...new Set(btns)]))
    if (btns.length) {
      await page.evaluate(() => [...document.querySelectorAll('button')].find(e => e.offsetParent !== null && /批准/.test((e.textContent || '').trim()))?.click())
      await page.waitForTimeout(1200)
      const after = await page.evaluate(() => ({
        dialogs: [...document.querySelectorAll('.n-modal, .n-dialog, .n-popover, .n-card')].filter(e => e.offsetParent !== null).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 100)),
        hash: location.hash,
      }))
      led.record('「批准」点击行为（确认层/直通）', true, JSON.stringify(after))
      await led.shot(page, 'inbox-approve')
      await page.keyboard.press('Escape')
    }
  } finally { await browser.close() }
}

// ── ⑤ 需关注/任务动态 条目点击 ──
{
  const { browser, page } = await fresh()
  try {
    const before = await page.evaluate(() => location.hash)
    await page.evaluate(() => {
      const tdp = [...document.querySelectorAll('[class*=tdp]')].find(e => e.offsetParent !== null && /需关注|任务动态/.test(e.innerText))
      const row = tdp ? [...tdp.querySelectorAll('*')].filter(e => e.offsetParent !== null && e.children.length <= 2 && (e.textContent || '').trim().length > 8)[0] : null
      row?.click()
    })
    await page.waitForTimeout(1800)
    led.record('右栏条目点击落点', true, `before=${before} after=${await page.evaluate(() => location.hash)}`)
  } finally { await browser.close() }
}

led.flush()
