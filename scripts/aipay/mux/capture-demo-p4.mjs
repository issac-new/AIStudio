// capture-demo-p4.mjs — P4 协作沟通三件套证据补拍
// ①消息内 card=t_ 卡链接 ②@当前登录人高亮 ③群侧栏任务流转时间线
// 前置：bella 已发真实完成回执（含 card= 与 @fanfan）；以 fanfan 视角观看。
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8802'
const OUT = '/Volumes/nvme2230/lab/ncwk-sim-mux/evidence/20260928-product-demo/shots-v2'
const SIM = '/Volumes/nvme2230/lab/ncwk-sim-mux'
const ROOM = '!ubRAvsUSUJTdTIiKEI:matrix.test'

const login = await fetch(`${BASE}/api/auth/matrix-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    matrixAccessToken: readFileSync(`${SIM}/creds/fanfan.token`, 'utf8').split('\n')[0].trim(),
    matrixUserId: '@fanfan:matrix.test', deviceId: 'CAPTURE-P4', homeserverUrl: 'http://127.0.0.1:8008',
  }),
}).then((r) => r.json())
if (!login.token) throw new Error('matrix-login 失败')

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.setDefaultTimeout(70000)

await page.goto(BASE + '/login')
const mtokFanfan = readFileSync(`${SIM}/creds/fanfan.token`, 'utf8').split('\n')[0].trim()
await page.evaluate(([tk, mt]) => {
  localStorage.setItem('hermes_api_key', tk)
  localStorage.setItem('hermes_server_url', location.origin)
  localStorage.setItem('hermes_locale', 'zh')
  // 浏览器侧 matrix-js-sdk 凭据（snake_case 键）：房间/消息同步的真正前置
  localStorage.setItem('matrix_access_token', mt)
  localStorage.setItem('matrix_user_id', '@fanfan:matrix.test')
  localStorage.setItem('matrix_device_id', 'CAPTURE-P4')
  localStorage.setItem('matrix_homeserver_url', 'http://127.0.0.1:8008')
}, [login.token, mtokFanfan])

await page.goto(BASE + '/#/app', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.goto(BASE + '/#/app/s/group/' + encodeURIComponent(ROOM), { waitUntil: 'domcontentloaded' })
// 等房间列表真同步（重启后首同步 60s 级），再点选分析群
await page.locator('text=支付收银台需求分析讨论群').first()
  .waitFor({ state: 'visible', timeout: 70000 })
  .catch(() => console.log('  [warn] 房间列表未同步'))
// 同名 6 群必点错——按 roomId 精确点选（data-testid="room-<roomId>"）
const roomBtn = page.locator(`[data-testid="flow-session-${ROOM}"]`)
if (await roomBtn.count() > 0) { await roomBtn.first().click().catch(() => {}); await page.waitForTimeout(20000) }
else if (await page.locator('text=支付收银台需求分析讨论群').first().isVisible().catch(() => false)) {
  await page.locator('text=支付收银台需求分析讨论群').first().click().catch(() => {}); await page.waitForTimeout(5000)
}

async function dismissOverlays() {
  for (let i = 0; i < 3; i++) {
    const bannerBtn = page.locator('[data-testid="studio-announcement"] button').last()
    if (await bannerBtn.isVisible().catch(() => false)) { await bannerBtn.click().catch(() => {}); await page.waitForTimeout(400); continue }
    break
  }
}

// ①② 卡链接 + @fanfan 高亮：先把消息滚动容器滚到底（最新消息在下），再定位
await page.evaluate(() => {
  const tiles = document.querySelectorAll('.msg-body')
  for (let i = tiles.length - 1; i >= 0; i--) {
    let el = tiles[i]
    while (el && el !== document.body) {
      const st = getComputedStyle(el)
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight
        return true
      }
      el = el.parentElement
    }
  }
  return false
})
await page.waitForTimeout(1500)
const probe = await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('*')).filter(el => el.children.length === 0 && /card=t_/.test(el.textContent || ''))
    const anchors = document.querySelectorAll('a[href*="board?task"]').length
    const cls = hit.slice(0, 3).map(el => (el.className && String(el.className).slice(0, 60)) || el.tagName)
    const parent = hit[0] ? (hit[0].parentElement ? String(hit[0].parentElement.className).slice(0, 60) : '') : null
    return { hitCount: hit.length, anchors, cls, parent }
  })
  console.log('PROBE', JSON.stringify(probe))
const dbg = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.msg-body'))
    const obj = document.querySelector('[class*="object" i], [class*="OBJECT"]')
    return { groupMsgs: document.querySelectorAll('.group-message').length, total: tiles.length, last3: tiles.slice(-3).map(t => t.textContent.slice(0, 50)), object: obj ? obj.textContent.slice(0, 60) : null, cardLinks: document.querySelectorAll('a[href*="#/app/board?task="]').length, mentionMe: document.querySelectorAll('.mention-highlight').length }
  })
  console.log('DEBUG', JSON.stringify(dbg, null, 1))
const msg = page.locator('.msg-body', { hasText: 'card=t_9e5c6c18' }).last()
await msg.waitFor({ state: 'visible', timeout: 30000 }).catch(() => console.log('  [warn] 回执消息未出现'))
await msg.scrollIntoViewIfNeeded().catch(() => {})
await page.waitForTimeout(1500)
await dismissOverlays()

// 断言（群聊面）：卡深链 + 提及高亮
const cardLink = page.locator('a[href*="#/app/board?task="]')
const linkCount = await cardLink.count()
const linkHref = linkCount > 0 ? await cardLink.first().getAttribute('href') : null
const meMention = page.locator('.mention-highlight')
const mentionCount = await meMention.count()
console.log(`assert: card-links=${linkCount} href=${linkHref} mention-me=${mentionCount}`)

await page.screenshot({ path: `${OUT}/s09b-cardlink-mention.png` })
console.log('shot: s09b-cardlink-mention')

// ③ 任务流转时间线（右栏 TaskDecisionPanel 的"任务流转"节）
const tl = page.locator('text=任务流转').first()
if (await tl.isVisible({ timeout: 15000 }).catch(() => false)) {
  await tl.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(1000)
  await dismissOverlays()
  await page.screenshot({ path: `${OUT}/s09c-taskflow-timeline.png` })
  console.log('shot: s09c-taskflow-timeline')
} else {
  console.log('  [warn] 任务流转节不可见')
}

await browser.close()
console.log('p4 capture done')
