import { openBrowser } from './harness.mjs'
const { browser, page } = await openBrowser()
await page.goto('http://localhost:8689/#/ide', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
const later = page.locator('button', { hasText: '稍后提醒' }).first()
if (await later.count()) await later.click({ force: true }).catch(() => {})
await page.waitForTimeout(2500)
const info = await page.evaluate(() => {
  document.body.style.background = 'rgb(255,0,0)'  // 红色标记：验证截图管线是否实时
  const b = document.body.innerText
  return { url: location.href, manage: b.includes('任务管理'), back: b.includes('返回'), first100: b.slice(0, 100).replace(/\s+/g, ' ') }
})
console.log('DOM=', JSON.stringify(info))
await page.screenshot({ path: '/tmp/regression-shots/truth-test.png' })
console.log('SHOT=/tmp/regression-shots/truth-test.png')
await browser.close()
