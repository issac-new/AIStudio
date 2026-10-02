// ekko 四页 flag-on 验证走查（8650 实例，VITE_CUSTOM_EKKO=true；不改代码默认）
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage()
const login = await fetch('http://localhost:8647/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: '123456' }) }).then(r => r.json())
await page.goto('http://localhost:8650/')
await page.evaluate(t => { localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_server_url', 'http://localhost:8649'); localStorage.setItem('hermes_locale', 'zh') }, login.token)
const results = []
const ok = (n, c, note = '') => { results.push([n, !!c]); console.log(`${c ? 'PASS' : 'FAIL'} ${n}${note ? ' — ' + note : ''}`) }
for (const route of ['ekko/memory', 'ekko/skills', 'ekko/mcp', 'ekko/settings']) {
  await page.goto('http://localhost:8650/#/' + route)
  await page.waitForTimeout(4000)
  const url = page.url()
  const bounced = !url.includes(route)
  const text = (await page.locator('body').innerText()).slice(0, 400)
  const hasError = /404|not found|不存在/i.test(text)
  ok(`/${route} 可开（flag-on 不被守卫弹回）`, !bounced && !hasError, `url=${url.split('#')[1]}`)
  await page.screenshot({ path: `/tmp/absorb-round2-shots/ekko-${route.replace('/', '-')}.png` })
}
await browser.close()
const failed = results.filter(r => !r[1])
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length ? 1 : 0)
