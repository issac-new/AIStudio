// 驾驶舱壳层走查（顶栏/注意力条/图标栏/栏控）——每个可交互元素点到并留证。
// 用法：node scripts/regression/walk-shell.mjs
import { openBrowser, bootApp, clearMasks, domClick, gotoHash, Ledger, BASE } from './harness.mjs'

const { browser, page } = await openBrowser()
const led = new Ledger('shell')
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))

async function step(name, fn) {
  errors.length = 0
  try {
    await fn()
    await page.waitForTimeout(900)
    await clearMasks(page)
    led.record(name, true, errors.length ? '但有错误: ' + errors[0] : '')
  } catch (e) {
    led.defect(name, String(e).slice(0, 150), 'P1')
  }
  if (errors.length) led.defect(name + ' [pageerror]', errors.slice(0, 2).join(' | '), 'P2')
}

try {
  await bootApp(page)
  await clearMasks(page)

  // ── 顶栏 ──
  await step('主题切换（月亮键）', async () => {
    const before = await page.evaluate(() => document.documentElement.className)
    await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.className.includes('theme') || b.getAttribute('aria-label')?.includes('主题') || b.getAttribute('title')?.match(/主题|深色|浅色|theme/i))?.click() })
    await page.waitForTimeout(600)
    const after = await page.evaluate(() => document.documentElement.className)
    if (before === after) throw new Error('主题类名无变化: ' + before)
    await led.shot(page, 'theme-toggled')
    // 还原
    await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.className.includes('theme') || b.getAttribute('aria-label')?.includes('主题') || b.getAttribute('title')?.match(/主题|深色|浅色|theme/i))?.click() })
    await page.waitForTimeout(400)
  })

  await step('语言切换 EN/ZH', async () => {
    await domClick(page, '[data-testid=ia-locale-toggle]')
    await page.waitForTimeout(800)
    const text = await page.evaluate(() => document.body.innerText.slice(0, 400))
    await led.shot(page, 'locale-toggled')
    await domClick(page, '[data-testid=ia-locale-toggle]') // 还原
    await page.waitForTimeout(600)
    if (!text) throw new Error('切语言后无文本')
  })

  await step('视图切换器 → IDE 工作台', async () => {
    await domClick(page, '[data-testid=ia-view-toggle]')
    await page.waitForTimeout(2500)
    const h = await page.evaluate(() => location.hash)
    await led.shot(page, 'view-switch-ide')
    if (!h.includes('ide')) throw new Error('未切到 IDE 视图, hash=' + h)
  })
  await step('视图切换器 → 返回沟通协作', async () => {
    await domClick(page, '[data-testid=ia-view-toggle]')
    await page.waitForTimeout(2500)
    const h = await page.evaluate(() => location.hash)
    if (h.includes('ide')) throw new Error('未返回, hash=' + h)
  })

  await step('搜索框（会话/任务/房间）', async () => {
    const box = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"]').first()
    await box.click()
    await box.fill('测试')
    await page.waitForTimeout(1500)
    await led.shot(page, 'search-open')
    const drop = await page.evaluate(() => document.body.innerText.includes('测试'))
    await box.fill('')
  })

  await step('任务统计 chip（任务 29）', async () => {
    await page.evaluate(() => { [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /任务\s*\d+/.test(e.textContent || '') && e.closest('header, .ia-header'))?.click() })
    await page.waitForTimeout(1200)
    await led.shot(page, 'task-chip')
  })

  for (const [tid, label] of [['ia-header-schedule', '今日有日程'], ['sit-online', '在线面板'], ['ia-header-notify', '通知面板'], ['ia-header-changelog', '更新日志'], ['ia-header-user', '用户菜单']]) {
    await step(`${label}（${tid}）`, async () => {
      await domClick(page, `[data-testid=${tid}]`)
      await page.waitForTimeout(1200)
      await led.shot(page, tid)
      const panel = await page.evaluate(() => [...document.querySelectorAll('.n-popover, .n-dropdown, .n-modal, .n-card')].map(e => e.innerText.trim().slice(0, 80)).filter(Boolean).slice(0, 3))
      console.log(`  ${tid} 弹层: ${JSON.stringify(panel)}`)
    })
    await clearMasks(page)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }

  // ── 注意力条 ──
  await step('注意力条任务 chip 点击', async () => {
    const chip = page.locator('.ia-attn-bar [class*=chip], .ia-attn-bar button').first()
    if (await chip.count() === 0) throw new Error('无注意力 chip')
    await chip.click({ force: true })
    await page.waitForTimeout(1500)
    await led.shot(page, 'attn-chip-click')
    const h = await page.evaluate(() => location.hash)
    console.log('  chip click → hash=' + h)
    await page.goBack().catch(() => {})
    await page.waitForTimeout(800)
  })

  // ── 左侧图标栏（逐个冷导航避开崩溃级联；跳过设备互联=F1 缺陷）──
  for (const [aria, hash] of [['单聊', 'hermes/chat'], ['群聊', 'hermes/group-chat'], ['工作流', 'hermes/workflow'], ['历史', 'app/history'], ['Agent 管理', 'studio/agents'], ['模型', 'hermes/models'], ['饲料', 'hermes/petdex'], ['设置', 'app/settings']]) {
    await step(`图标栏 ${aria} → /${hash}`, async () => {
      await page.evaluate((h) => { location.hash = '#/' + h }, hash)
      await page.waitForTimeout(3000)
      await clearMasks(page)
      const len = await page.evaluate(() => {
        const clone = document.body.cloneNode(true)
        for (const el of clone.querySelectorAll('.studio-navigation-rail, .ia-header, .ia-attn-bar, header, nav, aside')) el.remove()
        return (clone.innerText || '').replace(/\s+/g, '').length
      })
      await led.shot(page, 'rail-' + hash.replace(/\//g, '-'))
      if (len < 60) throw new Error('内容区空白 contentLen=' + len)
    })
  }

  // ── 栏控 ──
  for (const [tid, label] of [['ia-col-left-fold', '左栏折叠'], ['ia-col-right-fold', '右栏折叠'], ['ia-col-center-max', '中栏最大化']]) {
    await step(`${label}（${tid}）`, async () => {
      await gotoHash(page, 'app', 2500)
      await domClick(page, `[data-testid=${tid}]`)
      await page.waitForTimeout(800)
      await led.shot(page, tid)
      await domClick(page, `[data-testid=${tid}]`) // 还原
      await page.waitForTimeout(500)
    })
  }
} finally {
  led.flush()
  await browser.close()
}
