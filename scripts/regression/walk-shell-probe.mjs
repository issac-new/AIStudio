// 壳层探测：左侧图标栏归位（每个图标→目的页）+ 视图切换器（驾驶舱/沟通协作/IDE工作台）+ 顶栏各入口。
// 用法：node scripts/regression/walk-shell-probe.mjs
import { openBrowser, bootApp, clearMasks, domClick, Ledger } from './harness.mjs'

const { browser, page } = await openBrowser()
const led = new Ledger('shell-probe')

try {
  await bootApp(page)
  await clearMasks(page)

  // 1. 左侧图标栏：dump 全部元素的 testid/title/aria-label/text
  const rail = await page.evaluate(() => {
    const out = []
    const seen = new Set()
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.x > 70 || r.width < 12 || r.height < 12 || r.width > 68) continue
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ')
      if (t.length > 8) continue
      const key = `${Math.round(r.x)},${Math.round(r.y)},${el.className}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), text: t, testid: el.getAttribute('data-testid') || '', title: el.getAttribute('title') || '', aria: el.getAttribute('aria-label') || '', y: Math.round(r.y) })
    }
    return out.sort((a, b) => a.y - b.y)
  })
  console.log('RAIL=' + JSON.stringify(rail, null, 1))

  // 2. 视图切换器：悬停/点击后捕获菜单项
  const toggle = await page.locator('[data-testid=ia-view-toggle]').count()
  console.log('VIEW_TOGGLE_PRESENT=' + toggle)
  if (toggle) {
    await domClick(page, '[data-testid=ia-view-toggle]')
    await page.waitForTimeout(800)
    await led.shot(page, 'view-toggle-menu')
    const menu = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('.n-dropdown-option, .n-menu-item, [role=menuitem], [role=option]')) {
        out.push((el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30))
      }
      return out
    })
    console.log('VIEW_MENU=' + JSON.stringify(menu))
    await clearMasks(page)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }

  // 3. 顶栏气泡入口：hover 提示
  for (const tid of ['ia-header-schedule', 'ia-header-notify', 'ia-header-changelog', 'ia-header-user', 'ia-locale-toggle', 'sit-online']) {
    const c = await page.locator(`[data-testid=${tid}]`).count()
    led.record(`顶栏入口存在 ${tid}`, c > 0)
  }
  await led.shot(page, 'shell-top')
} finally {
  led.flush()
  await browser.close()
}
