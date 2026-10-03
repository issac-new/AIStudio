// 导航断裂定位：冷加载直开 vs 应用内 hash 切换，逐跳记录视图内容签名 + pageerror。
// 用法：node scripts/regression/walk-nav-stuck.mjs
import { openBrowser, Ledger, BASE } from './harness.mjs'

const { browser, page } = await openBrowser()
const led = new Ledger('nav-stuck')
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`) })

async function sig(tag) {
  const s = await page.evaluate(() => {
    // 内容区签名：去掉顶栏/注意力条/侧栏后，主内容文本前 60 字 + 主内容元素个数
    const mains = [...document.querySelectorAll('main, [class*=content], [class*=workbench], [class*=legacy]')]
      .map((e) => ({ cls: String(e.className).slice(0, 40), len: (e.innerText || '').trim().length }))
      .filter((x) => x.len > 0)
      .sort((a, b) => b.len - a.len)
      .slice(0, 3)
    return { hash: location.hash, mains }
  })
  console.log(`${tag}  hash=${s.hash}  ${JSON.stringify(s.mains)}`)
  return s
}

try {
  // ① 冷加载直开可疑页
  for (const h of ['hermes/files', 'hermes/group-chat', 'hermes/skills', 'app/runs', 'ide']) {
    errors.length = 0
    await page.goto(BASE + '/#/' + h, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4500)
    await sig('COLD /' + h)
    if (errors.length) console.log('   ERRORS: ' + errors.slice(0, 4).join(' || '))
  }

  // ② 应用内 hash 逐跳（与 walk-routes 相同的走法）
  errors.length = 0
  await page.goto(BASE + '/#/app', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)
  await sig('WARM start')
  for (const h of ['hermes/models', 'hermes/connections', 'studio/agents', 'hermes/group-chat', 'hermes/files', 'hermes/skills']) {
    errors.length = 0
    await page.evaluate((hh) => { location.hash = '#/' + hh }, h)
    await page.waitForTimeout(3000)
    await sig('WARM /' + h)
    if (errors.length) console.log('   ERRORS: ' + errors.slice(0, 4).join(' || '))
  }
} finally {
  led.flush()
  await browser.close()
}
