import { openBrowser, bootApp, clearMasks } from './harness.mjs'
const { browser, page } = await openBrowser()
await bootApp(page)
await clearMasks(page)
await page.screenshot({ path: '/tmp/regression-shots/sched-before.png' })
await page.locator('[data-testid=ia-header-schedule]').click()
await page.waitForTimeout(1800)
await page.screenshot({ path: '/tmp/regression-shots/sched-open.png' })
const visibleNow = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => (d.innerText || '').includes('添加待办'))
  if (!el) return 'no-el'
  const cs = getComputedStyle(el)
  return `${cs.display}/${cs.visibility}/${cs.opacity}`
})
console.log('modal computed style:', visibleNow)
await page.keyboard.press('Escape')
await page.waitForTimeout(900)
await page.screenshot({ path: '/tmp/regression-shots/sched-esc.png' })
// 试 ✕
const stillThere = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => (d.innerText || '').includes('添加待办'))
  return el ? getComputedStyle(el).display + '/' + getComputedStyle(el).visibility : 'gone'
})
console.log('after esc:', stillThere)
await browser.close()
