// 定点复现：/hermes/connections 渲染是否抛 connectionsExtras（features 未导入）。
// 双链可用：WALK_BASE 切 8689/8649。长等待盖过懒加载块。
// 用法：node scripts/regression/walk-connections-repro.mjs
import { openBrowser, Ledger, BASE } from './harness.mjs'

const { browser, page } = await openBrowser()
const led = new Ledger('conn-repro')
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })

try {
  // 关掉默认口令弹窗再测（它会一直悬着）
  await page.goto(BASE + '/#/app', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  for (let i = 0; i < 3 && (await page.locator('.n-modal-mask').count()) > 0; i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  errors.length = 0

  await page.evaluate(() => { location.hash = '#/hermes/connections' })
  await page.waitForTimeout(10000)
  const s = await page.evaluate(() => ({
    hash: location.hash,
    content: [...document.querySelectorAll('.ia-lshell__content, .app-main')]
      .map((e) => (e.innerText || '').trim().length).sort((a, b) => b - a)[0] ?? 0,
    tabs: [...document.querySelectorAll('.n-tabs-tab')].map((e) => e.textContent.trim()),
  }))
  console.log(`WARM connections  hash=${s.hash} contentLen=${s.content} tabs=${JSON.stringify(s.tabs)}`)
  console.log('ERRORS: ' + (errors.slice(0, 5).join(' || ') || '(none)'))
  led.record('ConnectionsPanel 渲染无崩溃', !errors.some((e) => e.includes('connectionsExtras')), `contentLen=${s.content}`)
  await led.shot(page, 'connections')
} finally {
  led.flush()
  await browser.close()
}
