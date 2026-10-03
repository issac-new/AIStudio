import { openBrowser, bootApp, clearMasks, Ledger } from './harness.mjs'
const { browser, page } = await openBrowser()
const led = new Ledger('truth')
await bootApp(page)
await clearMasks(page)
// 打开日程弹层：验证 z-index/遮罩与 Esc
await page.locator('[data-testid=ia-header-schedule]').click()
await page.waitForTimeout(1200)
const z = await page.evaluate(() => {
  const modal = [...document.querySelectorAll('div')].find(d => (d.innerText || '').includes('添加待办') && d.getBoundingClientRect().width > 900 && d.offsetParent !== null)
  const rail = document.querySelector('.studio-navigation-rail')
  const attn = document.querySelector('[data-testid=ia-attn], .ia-attn')
  const r = modal?.getBoundingClientRect()
  return {
    modalRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    modalZ: modal ? getComputedStyle(modal).zIndex : null,
    railZ: rail ? getComputedStyle(rail).zIndex : null,
    attnZ: attn ? getComputedStyle(attn).zIndex : null,
  }
})
console.log('Z-STACK=', JSON.stringify(z))
await led.shot(page, 'schedule-headless')
await page.keyboard.press('Escape')
await page.waitForTimeout(700)
const escClosed = await page.evaluate(() => !document.body.innerHTML.includes('添加待办'))
led.record('日程弹层 Esc 关闭', escClosed, '')
await led.shot(page, 'after-esc')
led.flush()
await browser.close()
