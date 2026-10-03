// IDE 工作台（/ide → /app/ide IdeShell）末级走查：任务侧栏三段/会话窗格按钮群/编辑器工具条/文件面板/浮窗。
// 用法：node scripts/regression/walk-ide.mjs
import { chromium } from '@playwright/test'
import { BASE, Ledger } from './harness.mjs'

const led = new Ledger('ide')

async function fresh(hash = 'ide') {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, locale: 'zh-CN' })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  await page.goto(BASE + '/#/' + hash, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  const later = page.locator('button', { hasText: '稍后提醒' }).first()
  if (await later.count()) { await later.click({ force: true }).catch(() => {}); await page.waitForTimeout(400) }
  return { browser, page, errors }
}
async function clickTestid(page, tid) {
  await page.evaluate((s) => {
    const el = document.querySelector(`[data-testid="${s}"]`)
    if (!el) throw new Error('not found: ' + s)
    el.click()
  }, tid)
}

// ── ① 壳层与任务侧栏三段 ──
{
  const { browser, page, errors } = await fresh()
  try {
    const shell = await page.evaluate(() => ({
      hash: location.hash,
      segs: [...document.querySelectorAll('[class*=ide] button, [class*=task-sidebar] button, [data-testid^=ide]')].filter(e => e.offsetParent !== null).map(e => ({ tid: e.getAttribute('data-testid') || '', text: (e.textContent || '').trim().slice(0, 12) })).slice(0, 40),
    }))
    console.log('IDE SHELL=' + JSON.stringify(shell, null, 1))
    led.record('IDE 壳渲染', shell.hash.includes('ide'), shell.hash)
    await led.shot(page, 'ide-shell')
    // 三段切换（进行中/已完成/工作空间）
    for (const label of ['进行中', '已完成', '工作空间']) {
      try {
        await page.evaluate((lb) => {
          const el = [...document.querySelectorAll('button, [role=tab]')].find(e => (e.textContent || '').trim().startsWith(lb) && e.offsetParent !== null)
          if (!el) throw new Error('seg not found: ' + lb)
          el.click()
        }, label)
        await page.waitForTimeout(1200)
        led.record(`侧栏三段·${label}`, true)
        await led.shot(page, 'seg-' + encodeURIComponent(label))
      } catch (e) { led.defect(`侧栏三段·${label}`, String(e).slice(0, 100), 'P2') }
    }
  } finally { await browser.close() }
}

// ── ② 会话窗格动作按钮群（逐个点开-收起，留证）──
{
  const { browser, page, errors } = await fresh()
  try {
    for (const [tid, label] of [
      ['ide-chat-new', '新建会话'],
      ['ide-chat-recovery', '会话恢复'],
      ['ide-chat-video-frames', '视频抽帧'],
      ['ide-chat-find', '会话内查找'],
      ['ide-chat-btw', '侧问/btw'],
      ['ide-chat-bgtasks', '后台任务中心'],
      ['ide-chat-sidesession', '对照分屏'],
      ['ide-chat-float-plan', '计划浮窗'],
      ['ide-chat-float-agents', '智能体浮窗'],
      ['ide-debug-info', '调试信息'],
    ]) {
      errors.length = 0
      try {
        await clickTestid(page, tid)
        await page.waitForTimeout(1100)
        await led.shot(page, 'btn-' + tid)
        // 再点一次收起（toggle 类）或 Esc
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(300)
        led.record(`会话窗格 ${label}（${tid}）可点`, true, errors.length ? 'err=' + errors[0] : '')
      } catch (e) { led.defect(`会话窗格 ${label}（${tid}）`, String(e).slice(0, 110), 'P1') }
      if (errors.length) led.defect(`${label} [pageerror]`, errors.slice(0, 2).join(' | '), 'P2')
    }
  } finally { await browser.close() }
}

// ── ③ 模型切换与输入区 ──
{
  const { browser, page, errors } = await fresh()
  try {
    const composer = await page.evaluate(() => {
      const ta = document.querySelector('textarea, [contenteditable=true]')
      return ta ? { tag: ta.tagName, ph: ta.getAttribute('placeholder') || '' } : null
    })
    led.record('IDE 输入区存在', !!composer, JSON.stringify(composer))
    if (composer) {
      await page.locator('textarea, [contenteditable=true]').first().fill('回归测试探针消息（勿发出）')
      await led.shot(page, 'composer-typed')
      // 模型切换器
      try {
        await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find(b => /aim|模型|Default|默认/.test((b.textContent || '').trim()) && b.offsetParent !== null)
          if (!el) throw new Error('model switcher not found')
          el.click()
        })
        await page.waitForTimeout(1000)
        const menu = await page.evaluate(() => [...document.querySelectorAll('.n-select-menu, .n-dropdown-menu, [class*=dropdown]')].filter(e => e.offsetParent !== null).map(e => e.innerText.slice(0, 100)))
        led.record('IDE 模型切换器', menu.length > 0, JSON.stringify(menu))
        await led.shot(page, 'model-switcher')
      } catch (e) { led.defect('IDE 模型切换器', String(e).slice(0, 110), 'P2') }
    }
  } finally { await browser.close() }
}

// ── ④ 文件面板（查看文件/Git 页签）──
{
  const { browser, page, errors } = await fresh()
  try {
    const tabs = await page.evaluate(() => [...document.querySelectorAll('button, [role=tab]')].filter(e => e.offsetParent !== null && ['查看文件', 'Git'].includes((e.textContent || '').trim())).map(e => e.textContent.trim()))
    led.record('IDE 文件面板页签', tabs.length > 0, JSON.stringify(tabs))
    // 点 Git 页签
    await page.evaluate(() => { [...document.querySelectorAll('button, [role=tab]')].find(e => (e.textContent || '').trim() === 'Git' && e.offsetParent !== null)?.click() })
    await page.waitForTimeout(1500)
    await led.shot(page, 'git-tab')
    const gitPane = await page.evaluate(() => document.body.innerText.includes('Git') )
    // 点开一个文件（若树有条目）
    const opened = await page.evaluate(() => {
      const node = [...document.querySelectorAll('[class*=file] , [class*=tree]')].filter(e => e.offsetParent !== null && e.innerText.trim().length > 0 && e.innerText.trim().length < 40)[0]
      if (!node) return false
      node.click(); return true
    })
    await page.waitForTimeout(1200)
    await led.shot(page, 'file-open')
    led.record('IDE 文件树可交互', opened, '')
  } finally { await browser.close() }
}

led.flush()
