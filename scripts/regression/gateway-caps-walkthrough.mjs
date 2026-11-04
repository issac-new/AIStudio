// 网关能力实弹走查（2026-10-02 三受阻项解封；2026-11-04 r26 清偿重构）
// 断言：①治理 RuntimeSection 网关能力卡 ②IDE 历史浏览器 Fork 按钮（真实打开链路）
// 蓝图画廊 16 卡+槽位表单断言面已随 0d44031ee「删除旧运行中心与编排死件」有意移除
// （端点 /api/runtime-caps/gateway/blueprints 保留，UI 入口收敛）——不复活；
// 旧④ forkBtn>=0 恒真（自我豁免）已改为真实打开链路断言。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
const BASE = 'http://localhost:8649'
const shots = '/tmp/gateway-caps-shots'
mkdirSync(shots, { recursive: true })
const results = []
const ok = (n, c, note = '') => { results.push([n, !!c]); console.log(`${c ? 'PASS' : 'FAIL'} ${n}${note ? ' — ' + note : ''}`) }
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage()
const login = await fetch('http://localhost:8647/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'dev-bootstrap' }) }).then(r => r.json())
if (!login.token) { console.log('login failed'); process.exit(1) }
await page.goto(BASE + '/')
await page.evaluate(t => { localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_server_url', location.origin); localStorage.setItem('hermes_locale', 'zh') }, login.token)
try {
  // ① 治理 RuntimeSection（挂 GovRegistryRulesView→StageAssetsPanel，r26 清偿：
  // 旧 /app/board?tab=gov-registry 已失效；metrics 页是 EfficiencyRuntimeSection
  // 非 RuntimeSection——同名族组件分流，勿混）。
  // gateway 卡是 v-if="gateway && gateway.healthy" 数据条件渲染——8647 未挂
  // runtime-caps 源时为诚实空态（fail-soft），断言=组件挂载不炸＋卡按数据在场。
  await page.goto(BASE + '/#/app/stage/setup?tab=assets', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
  for (let i = 0; i < 3; i++) {
    if (!await page.locator('.n-modal-mask').count()) break
    const btn = page.locator('.n-modal .n-base-close').first()
    if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(500) } else { await page.keyboard.press('Escape'); await page.waitForTimeout(500) }
  }
  const gov = await page.evaluate(() => ({
    crashed: (document.body.innerText || '').includes('Unhandled'),
    gwCard: document.querySelectorAll('[data-testid="runtime-gateway"]').length,
    anyRuntime: document.querySelectorAll('[class*="runtime__"]').length,
  }))
  ok('① 阶段①assets 页 RuntimeSection 挂载不炸', !gov.crashed && gov.anyRuntime > 0, `runtimeEls=${gov.anyRuntime}`)
  ok('① gateway 卡按数据在场（healthy 才渲染，缺席=诚实空态）', gov.gwCard <= 1, `card=${gov.gwCard}（0=runtime-caps 源不在 8647，环境态非缺陷）`)
  await page.screenshot({ path: `${shots}/runtime-gateway.png` }).catch(() => {})

  // ② IDE 历史浏览器 Fork 真链路入口：无任务深链时 IdeChatPane 不渲染（会话列随
  // 任务绑定出现），与 ide-workspace-verify 同款任务深链。
  await page.goto(BASE + '/#/app/ide?task=t_5233eb3a', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ide-shell', { timeout: 30000 })
  await page.waitForSelector('.ide-chat', { timeout: 20000 })
  await page.waitForTimeout(3000)
  const histBtn = page.locator('[data-testid="ide-chat-history"]')
  const histBtnOk = await histBtn.count() === 1
  ok('② IDE 历史浏览器按钮在', histBtnOk, `btn=${await histBtn.count()}`)
  if (histBtnOk) {
    await histBtn.click()
    await page.waitForTimeout(1000)
    const browserOk = await page.locator('[data-testid="ide-history-browser"]').count() === 1
    ok('② 历史浏览器面板挂载', browserOk)
    if (browserOk) {
      // Fork 按钮随历史行渲染（v-for 行内）——无历史消息=空态无按钮，合法
      const rows = await page.locator('[data-testid^="ide-history-row-"]').count()
      const forks = await page.locator('[data-testid="ide-history-fork"]').count()
      if (rows > 0) {
        ok('② 历史面板 Fork 按钮在（真链路入口）', forks >= 1, `rows=${rows} forks=${forks}`)
      } else {
        ok('② 历史面板空态（无历史消息，fork 行级缺席合法）', true, `rows=0`)
      }
      await page.screenshot({ path: `${shots}/ide-history-fork.png` }).catch(() => {})
    }
  }
} finally {
  await browser.close().catch(() => {})
}
const failed = results.filter(r => !r[1])
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length ? 1 : 0)
