// 特性门关闭态浏览器走查（2026-11-04 r26 未做项清偿，dev 链 8649→8647）
// 负断言面：关闭门在 UI 上不泄漏（用户看不见）。与 s3-feature-gates.test.ts
// （源码级：开关值+patch 挂载点）互补成双层守门——本脚本验「最终真值」。
// 覆盖：voice（设置无 stt/tts tab）pet（侧栏无 petdex+/desktop-pet 透明空态）
// connectionsExtras（连接页仅 remote tab）agentManager（/studio/agents 不可达）
// externalLinks（外链路由守卫弹回）imageAssist（模型页无 auxiliary tab）。
// matrixAuth：开关在（config/features.ts）但全仓无 UI 消费面（仅 s3 开关断言引用）
// ——浏览器级无测试对象，待该门接上 UI 面时在此补行（spec 2026-11-04-regression-tooling-r26 D2）。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = process.env.WALK_BASE || 'http://localhost:8649'
const API = process.env.WALK_API || 'http://localhost:8647'
const shots = '/tmp/feature-off-shots'
mkdirSync(shots, { recursive: true })

const results = []
function ok(name, cond, note = '') {
  results.push({ name, pass: !!cond, note })
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage()
  const login = await fetch(API + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'dev-bootstrap' }),
  }).then(r => r.json()).catch(e => ({ error: String(e) }))
  if (!login.token) { console.log('login failed:', JSON.stringify(login).slice(0, 200)); process.exit(1) }
  await page.goto(BASE + '/', { waitUntil: 'load' })
  await page.evaluate(t => {
    localStorage.setItem('hermes_api_key', t)
    localStorage.setItem('hermes_server_url', location.origin)
    localStorage.setItem('hermes_locale', 'zh')
  }, login.token)
  // 生产链冷启动竞态（r26 实录）：注入 token 后 app 可能已按未认证态启动，后续
  // hash 直达被落地重定向覆盖（connections→chat）。reload 让 app 按认证态重启，
  // 等 Vue 挂载+启动占位消失再导航（walk-routes ensureLogin 同款判据）。
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const el = document.querySelector('#app')
    return Boolean(el?.__vue_app__) && !(document.body?.innerText || '').includes('AIStudio 加载中')
  }, undefined, { timeout: 60000 }).catch(() => {})

  // ── voice：/hermes/settings 无 stt/tts tab（patch 524 门控）──
  await page.goto(BASE + '/#/hermes/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.settings-view, [class*="settings"]', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const voiceLeak = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"], .n-tab, .n-tabs-tab')].map(el => el.textContent?.trim() || '').filter(t => /^(语音|STT|TTS|Speech|stt|tts)$/i.test(t)))
  ok('voice 关：设置页无 stt/tts tab', voiceLeak.length === 0, `leak=${JSON.stringify(voiceLeak)}`)
  await page.screenshot({ path: `${shots}/01-voice-off.png` })

  // ── pet：设置侧栏无 petdex 条目 + /desktop-pet 透明空态 ──
  await page.goto(BASE + '/#/app/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="ia-settings-sidebar"]', { timeout: 20000 })
  await page.waitForTimeout(800)
  const petLinks = await page.locator('[data-testid="ia-settings-sidebar"] a').evaluateAll(
    els => els.map(a => a.getAttribute('href') ?? '').filter(h => h.includes('petdex')))
  ok('pet 关：设置侧栏无 petdex 条目', petLinks.length === 0, `leak=${petLinks.join(',')}`)
  await page.goto(BASE + '/#/desktop-pet', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const petPage = await page.evaluate(() => ({
    len: (document.body.innerText || '').replace(/\s+/g, '').length,
    // 可见尺寸判据：空态挂载点允许存在 0×0 canvas/隐藏 img（透明壳），可见渲染才算泄漏
    visiblePet: [...document.querySelectorAll('canvas, img')].some(el => {
      const r = el.getBoundingClientRect()
      return r.width > 8 && r.height > 8
    }),
  }))
  ok('pet 关：/desktop-pet 透明空态', petPage.len < 200 && !petPage.visiblePet, `len=${petPage.len} visiblePet=${petPage.visiblePet}`)
  await page.screenshot({ path: `${shots}/02-pet-off.png` })

  // ── connectionsExtras：/hermes/connections 无 app/mcu、remote 单面板直显 ──
  // 关闭态产品形态（ConnectionsPanel:25）：activeTab 直落 remote，单面板无 tab 切换条
  // ——r26 诊断实录 tabs=[] 是设计内（单面板不渲染 NTabPane 族），非数据缺失。
  await page.goto(BASE + '/#/hermes/connections', { waitUntil: 'domcontentloaded' })
  // 生产链首访冷加载慢（r26 实录：固定 2.5s 时 bodyLen=121 假红，加长即 2588）
  // ——轮询等页面实质内容渲染再采样。
  await page.waitForFunction(() => (document.body.innerText || '').replace(/\s+/g, '').length > 400, undefined, { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(800)
  const conn = await page.evaluate(() => {
    const text = document.body.innerText || ''
    // 判据用 DOM 而非 body 文本采样（r26 实录：页头「设备互联」在 innerText 中
    // 位置随壳层排版漂移，文本 regex 采样假红；DOM 判据稳定）。
    return {
      tabs: [...document.querySelectorAll('[role="tab"], .n-tabs-tab')].map(el => el.textContent?.trim() || '').filter(Boolean),
      connEls: document.querySelectorAll('[class*="connection"]').length,
      pageHeader: document.querySelector('.page-header, [class*="page-header"]')?.textContent?.trim().slice(0, 20) || '',
      hasAppFace: /应用互联|Apps? 互联/i.test(text),
      hasMcuFace: /MCU|微控/i.test(text),
    }
  })
  ok('connectionsExtras 关：连接页无 app/mcu tab/面板', !conn.hasAppFace && !conn.hasMcuFace, `tabs=${JSON.stringify(conn.tabs.slice(0, 6))}`)
  ok('connectionsExtras 关：remote 单面板直显（页面在渲染）', (conn.connEls > 0 || conn.pageHeader.includes('设备互联')) && !conn.hasAppFace, `connEls=${conn.connEls} header=${conn.pageHeader}`)
  await page.screenshot({ path: `${shots}/03-connections-off.png` })

  // ── agentManager：/studio/agents 路由不可达（守卫改道或 not-found）──
  await page.goto(BASE + '/#/studio/agents', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const amUrl = page.url()
  const amText = await page.evaluate(() => (document.body.innerText || '').slice(0, 300))
  ok('agentManager 关：/studio/agents 不可达', !amUrl.includes('/studio/agents') || amText.includes('找不到') || amText.includes('not found') || amText.length < 50, `url=${amUrl.slice(-30)}`)
  await page.screenshot({ path: `${shots}/04-agentmanager-off.png` })

  // ── externalLinks：外链路由被守卫送回 /app（walk-routes CANONICAL 同判）──
  await page.goto(BASE + '/#/share/group-chat/xyz', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const elUrl = page.url()
  ok('externalLinks 关：外链路由守卫弹回', !elUrl.includes('/share/'), `url=${elUrl.slice(-24)}`)

  // ── imageAssist：/hermes/models 无 auxiliary tab ──
  await page.goto(BASE + '/#/hermes/models', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const auxTabs = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"], .n-tabs-tab')].map(el => el.textContent?.trim() || '').filter(t => /辅助|Auxiliary/i.test(t)))
  ok('imageAssist 关：模型页无 auxiliary tab', auxTabs.length === 0, `leak=${JSON.stringify(auxTabs)}`)
  await page.screenshot({ path: `${shots}/05-imageassist-off.png` })
} finally {
  await browser.close().catch(() => {})
}
const failed = results.filter(r => !r.pass)
console.log(`\n== 走查 ${results.length - failed.length}/${results.length} ==`)
if (failed.length) { console.log(JSON.stringify(failed, null, 2)); process.exit(1) }
