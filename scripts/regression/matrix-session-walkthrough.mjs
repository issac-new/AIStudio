// matrix 客户端真实会话内容验收（2026-11-02 回归轮挂账②专项）：
// 走查探针只能验「访客空态」（allowBlank），本探针补「有真实会话与内容」的正路——
// REST 以网关矩阵账号真建房＋真发消息（帧内容一致法：符合真实使用情形有实质内容），
// UI 走 /matrix 与 /matrix/room/:roomId 验读链路（store 自动桥 gateway-credentials→sync），
// 断言房间名与消息标记真实渲染，截图留证，收尾离开房间清场。
// 用法：node scripts/regression/matrix-session-walkthrough.mjs
import { openBrowser, bootApp, gotoHash, Ledger, SHOTS } from './harness.mjs'

const led = new Ledger('matrix-session')
const MARK = `MXVERIFY-${Date.now().toString(36)}`
const ROOM_NAME = `回归验证房-${MARK}`

async function gatewayCreds() {
  const g = await (await fetch(`${process.env.WALK_BASE || 'http://localhost:8649'}/api/matrix/gateway-credentials`)).json()
  if (!g?.configured || !g.accessToken) throw new Error('gateway-credentials 未配置或网关缺席')
  return g
}

async function mx(g, method, path, body) {
  const res = await fetch(`${g.homeserverUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${g.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)?.slice(0, 120)}`)
  return json
}

const g = await gatewayCreds()
led.record('网关矩阵凭据', true, `${g.userId} @ ${g.homeserverUrl}`)
const created = await mx(g, 'POST', '/_matrix/client/r0/createRoom', { name: ROOM_NAME, preset: 'private_chat' })
const roomId = created.room_id
led.record('REST 真建房间', !!roomId, roomId)
for (const text of [`${MARK} 消息一：回归验收实内容`, `${MARK} 消息二：时间线中段`, `${MARK} 消息三：收尾`]) {
  await mx(g, 'PUT', `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, { msgtype: 'm.text', body: text })
}
led.record('REST 真发消息', true, `3 条，标记 ${MARK}`)

const { browser, page } = await openBrowser()
const consoleErrors = []
page.on('pageerror', e => consoleErrors.push(String(e)))
try {
  await bootApp(page)
  // /matrix 全屏客户端页：面板挂载＋store 桥接自动 sync
  await gotoHash(page, 'matrix', 1500)
  await page.waitForSelector('.matrix-chat-panel', { timeout: 30000 })
  led.record('/matrix 面板挂载', true)
  await led.shot(page, 'matrix-client')

  // 直连房间路由：等待 sync 完成后时间线渲染出消息标记
  await gotoHash(page, `matrix/room/${encodeURIComponent(roomId)}`, 1500)
  await page.waitForFunction(({ mark }) =>
    (document.body.innerText || '').includes(mark) && (document.body.innerText || '').includes('消息二')
  , { mark: MARK }, { timeout: 45000 })
  const bodyText = await page.evaluate(() => (document.body.innerText || '').slice(0, 4000))
  const hits = [`${MARK} 消息一`, `${MARK} 消息二`, `${MARK} 消息三`].filter(t => bodyText.includes(t))
  led.record('房间时间线真实渲染', hits.length === 3, `命中 ${hits.length}/3 条；房名在场=${bodyText.includes('回归验证房')}`)
  await led.shot(page, 'matrix-room-timeline')
  const errs = consoleErrors.filter(e => !e.includes('ResizeObserver'))
  if (errs.length) led.defect('matrix 页 console 错误', errs.slice(0, 3).join(' | '), 'P2')
} finally {
  led.flush()
  await browser.close()
  try {
    await mx(g, 'POST', `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/leave`, {})
    console.log(`[cleanup] 已离开房间 ${roomId}`)
  } catch (e) { console.log(`[cleanup] 离开房间失败（下次运行兜底）: ${e.message}`) }
}
if (led.items.some(i => !i.ok)) process.exitCode = 1
console.log(`[artifacts] ${SHOTS}`)
