// 冷加载对话框捕获：/app、/ide、/hermes/group-chat 冷加载弹的是什么。
// 用法：node scripts/regression/walk-dialog-capture.mjs
import { openBrowser, Ledger, BASE } from './harness.mjs'

const { browser, page } = await openBrowser()
const led = new Ledger('dialog-capture')

try {
  for (const h of ['app', 'ide', 'hermes/group-chat']) {
    await page.goto(BASE + '/#/' + h, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5000)
    const dlg = await page.evaluate(() => {
      const out = []
      for (const d of document.querySelectorAll('.n-dialog, .n-modal, .n-card')) {
        const t = (d.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 300)
        if (t) out.push(t)
      }
      return out
    })
    console.log(`/#/${h}  DIALOGS=${JSON.stringify(dlg, null, 1)}`)
    await led.shot(page, h.replace(/\//g, '-'))
  }
} finally {
  led.flush()
  await browser.close()
}
