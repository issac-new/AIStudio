// UX 复盘·动线实测：跨界面入口落点 + 视图切换状态保持 + 四类任务清单区分度。
// 每组独立上下文防污染。用法：node scripts/regression/ux-flows.mjs
import { chromium } from '@playwright/test'
import { BASE, Ledger } from './harness.mjs'

const led = new Ledger('ux-flows')

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

// ── ① 注意力条 chip 点击落点（阻塞/普通两类）──
{
  const { browser, page } = await fresh()
  try {
    const chips = await page.evaluate(() => {
      const bar = document.querySelector('.ia-attn')
      if (!bar) return []
      const items = [...bar.querySelectorAll('button, [class*=chip], [class*=item]')].filter(e => e.offsetParent !== null)
      return items.slice(0, 4).map(e => ({ text: (e.textContent || '').trim().slice(0, 24), blocked: /阻塞/.test(e.textContent || '') }))
    })
    for (let i = 0; i < Math.min(2, chips.length); i++) {
      await page.evaluate((idx) => {
        const bar = document.querySelector('.ia-attn')
        if (!bar) return
        const items = [...bar.querySelectorAll('button, [class*=chip], [class*=item]')].filter(e => e.offsetParent !== null)
        items[idx].click()
      }, i)
      await page.waitForTimeout(1800)
      led.record(`注意力条 chip#${i}（${chips[i].blocked ? '阻塞' : '普通'}）落点`, true, `hash=${await page.evaluate(() => location.hash)} | ${chips[i].text}`)
    }
  } finally { await browser.close() }
}

// ── ② 视图切换状态保持（选中会话 → 切 IDE → 切回）──
{
  const { browser, page } = await fresh()
  try {
    // 选第一个会话
    await page.evaluate(() => {
      const item = [...document.querySelectorAll('[class*=flow-item], [class*=session]')].filter(e => e.offsetParent !== null && /mini-site|会话/.test(e.textContent || ''))[0]
      item?.click()
    })
    await page.waitForTimeout(2000)
    const before = await page.evaluate(() => location.hash)
    await page.locator('[data-testid=ia-view-toggle]').click()
    await page.waitForTimeout(3000)
    const ideHash = await page.evaluate(() => location.hash)
    const ideHasSession = await page.evaluate(() => (document.body.innerText || '').includes('mini-site'))
    await page.locator('[data-testid=ia-view-toggle]').click()
    await page.waitForTimeout(2500)
    const backHash = await page.evaluate(() => location.hash)
    const backHasSession = await page.evaluate(() => (document.body.innerText || '').includes('mini-site'))
    led.record('视图切换状态保持（会话上下文往返）', ideHasSession && backHasSession, `before=${before} ide=${ideHash} ideSession=${ideHasSession} back=${backHash} backSession=${backHasSession}`)
  } finally { await browser.close() }
}

// ── ③ 右栏四类清单的区分度（等我/需关注/挂接/动态 的内容与徽标）──
{
  const { browser, page } = await fresh()
  try {
    const probe = await page.evaluate(() => {
      const tdp = [...document.querySelectorAll('[class*=tdp]')].filter(e => e.offsetParent !== null)
      const heads = tdp.filter(e => e.children.length <= 4 && e.innerText.trim().length < 30 && /等我|需关注|挂接|动态|任务/.test(e.innerText)).map(e => e.innerText.trim().replace(/\s+/g, ' '))
      return { heads: [...new Set(heads)].slice(0, 10) }
    })
    led.record('右栏清单分区与标题枚举', probe.heads.length > 0, JSON.stringify(probe.heads))
    await led.shot(page, 'right-panel-sections')
  } finally { await browser.close() }
}

// ── ④ 搜索（顶栏搜索 → 结果跳转）──
{
  const { browser, page } = await fresh()
  try {
    await page.locator('input[placeholder*="搜索"]').first().fill('mini-site')
    await page.waitForTimeout(1800)
    const results = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('[class*=spotlight], [class*=search]')].filter(e => e.offsetParent !== null && e.innerText.includes('mini-site'))
      return panel.map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 120)).slice(0, 2)
    })
    led.record('搜索出结果并可辨识分组', results.length > 0, JSON.stringify(results))
    await led.shot(page, 'search-results')
    // 点第一个结果看落点
    await page.evaluate(() => {
      const panel = [...document.querySelectorAll('[class*=spotlight], [class*=search]')].find(e => e.offsetParent !== null && e.innerText.includes('mini-site'))
      const row = panel ? [...panel.querySelectorAll('li, [class*=row], [class*=item], button')].filter(e => /mini-site/.test(e.textContent || ''))[0] : null
      row?.click()
    })
    await page.waitForTimeout(1800)
    led.record('搜索结果点击落点', true, `hash=${await page.evaluate(() => location.hash)}`)
  } finally { await browser.close() }
}

// ── ⑤ 概览（/app/dash）三卡的可点击性与落点 ──
{
  const { browser, page } = await fresh('app/dash')
  try {
    const cards = await page.evaluate(() => {
      const clickable = [...document.querySelectorAll('button, a, [class*=card]')].filter(e => e.offsetParent !== null && /待办|评审|交付/.test(e.textContent || '') && (e.textContent || '').trim().length < 40)
      return clickable.map(e => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)).slice(0, 8)
    })
    led.record('概览三卡入口枚举', cards.length > 0, JSON.stringify(cards))
    if (cards.length) {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('button, a, [class*=card]')].find(e => e.offsetParent !== null && /待办|评审|交付/.test(e.textContent || '') && (e.textContent || '').trim().length < 40)
        el?.click()
      })
      await page.waitForTimeout(1600)
      led.record('概览卡点击落点', true, `hash=${await page.evaluate(() => location.hash)}`)
    }
    await led.shot(page, 'dash-cards')
  } finally { await browser.close() }
}

// ── ⑥ 饲料（apiRelay）外链行为证实 ──
{
  const { browser, page } = await fresh()
  try {
    const info = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find(e => e.href && e.href.includes('apikey'))
      return a ? { href: a.href, label: a.getAttribute('aria-label') || a.textContent.trim(), target: a.target } : null
    })
    led.record('图标栏外链实况', !!info, JSON.stringify(info))
  } finally { await browser.close() }
}

led.flush()
