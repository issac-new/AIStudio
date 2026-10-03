// 冻结级联因果隔离：三组对照实验（每组全新浏览器上下文）。
//   E1: /hermes/connections（崩溃页）→ /hermes/files  是否冻
//   E2: /studio/agents（vnode 崩溃页）→ /hermes/files  是否冻
//   E3: /app → /hermes/files（对照，不经过崩溃页）是否正常
// 用法：node scripts/regression/walk-freeze-isolate.mjs
import { chromium } from '@playwright/test'
import { BASE } from './harness.mjs'

async function run(name, seq) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  try {
    await page.goto(BASE + '/#/app', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4500)
    for (let i = 0; i < 3 && (await page.locator('.n-modal-mask').count()) > 0; i++) {
      await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    }
    for (const h of seq) {
      errors.length = 0
      await page.evaluate((hh) => { location.hash = '#/' + hh }, h)
      await page.waitForTimeout(4500)
      const contentLen = await page.evaluate(() => {
        const clone = document.body.cloneNode(true)
        for (const el of clone.querySelectorAll('.studio-navigation-rail, .ia-header, .ia-attn-bar, header, nav, aside')) el.remove()
        return (clone.innerText || '').replace(/\s+/g, '').length
      })
      console.log(`${name} /${h}  contentLen=${contentLen}  errors=${JSON.stringify(errors.slice(0, 2))}`)
    }
  } finally {
    await browser.close()
  }
}

await run('E1', ['hermes/connections', 'hermes/files'])
await run('E2', ['studio/agents', 'hermes/files'])
await run('E3', ['hermes/files', 'hermes/skills'])
