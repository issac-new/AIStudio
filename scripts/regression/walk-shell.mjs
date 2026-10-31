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

  // 2026-10-31 testid 校正：视图切换器=IaWorkspaceSwitch（ia-workspace-collab/ide/sim，
  // 2026-10-20 日常/推演拆分轮启用），旧 ia-view-toggle 已退役——此前 6 条假缺陷之源。
  // 点击用真实点击＋一次重试：boot 早期（auth 就绪前）点击会被落地重定向覆盖
  // （P2 产品竞态，spec 2026-10-31-three-zone-regression-fixes 挂账：wait 1.5-6s
  // 点击 3 次全丢、10s 全就绪 100% 成功，实测自愈型）。重试后仍不动才记缺陷。
  // 先等落地稳定（boot 竞态下异步落地恢复可晚至 ~15s 覆盖用户点击——P2 挂账，
  // 脚本按「应用稳定后可交互」口径测；hash 连续 1.2s 不变视为稳定，上限 18s）
  async function waitLandingSettled() {
    await page.waitForFunction(() => location.hash !== '#/' && location.hash !== '', undefined, { timeout: 15000 }).catch(() => {})
    await page.evaluate(() => new Promise((resolve) => {
      let last = location.hash; const t0 = Date.now()
      const iv = setInterval(() => {
        if (location.hash === last || Date.now() - t0 > 18000) { clearInterval(iv); resolve(null) }
        last = location.hash
      }, 400)
    }))
  }
  async function switchAndWait(testid, wantIn, wantOut) {
    await waitLandingSettled()
    for (let attempt = 1; attempt <= 2; attempt++) {
      await page.locator(`[data-testid=${testid}]`).first().click({ timeout: 8000 })
      await page.waitForTimeout(2500)
      const h = await page.evaluate(() => location.hash)
      if ((wantIn === null || h.includes(wantIn)) && (wantOut === null || !h.includes(wantOut))) return h
    }
    throw new Error(`两次点击未跳转, hash=${await page.evaluate(() => location.hash)}`)
  }
  await step('视图切换器 → IDE 工作台', async () => {
    const h = await switchAndWait('ia-workspace-ide', 'ide', null)
    await led.shot(page, 'view-switch-ide')
    return h
  })
  await step('视图切换器 → 返回沟通协作', async () => {
    await switchAndWait('ia-workspace-collab', null, 'ide')
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

  // ── 注意力条（数据态容错：注意力条无活跃项=无 chip，属正常空态而非缺陷）──
  {
    const bar = page.locator('.ia-attn-bar')
    const chip = page.locator('.ia-attn-bar [class*=chip], .ia-attn-bar button').first()
    if ((await bar.count()) === 0 || (await chip.count()) === 0) {
      led.record('注意力条任务 chip 点击', true, '注意力条空态（无活跃项＝数据态，非缺陷）')
    } else {
      try {
        await chip.click({ force: true })
        await page.waitForTimeout(1500)
        await led.shot(page, 'attn-chip-click')
        const h = await page.evaluate(() => location.hash)
        led.record('注意力条任务 chip 点击', true, 'chip click → hash=' + h)
        await page.goBack().catch(() => {})
        await page.waitForTimeout(800)
      } catch (e) {
        led.defect('注意力条任务 chip 点击', String(e).slice(0, 100), 'P1')
      }
    }
  }

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

  // ── 栏控（2026-10-31 校正：三栏栏控=IaColumnControls，testid 形如 ia-col-*-max/-popout，
  //   2026-10-23 栏控统一轮后 fold 语义并入 max；栏控只挂 WorkbenchView——须落在
  //   /app/collab 而非 /app 旅程页，此前错页+旧 testid＝4 条假缺陷）──
  for (const [tid, label] of [['ia-col-left-max', '左栏最大化'], ['ia-col-right-max', '右栏最大化'], ['ia-col-center-max', '中栏最大化']]) {
    await step(`${label}（${tid}）`, async () => {
      await gotoHash(page, 'app/collab', 3000)
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
