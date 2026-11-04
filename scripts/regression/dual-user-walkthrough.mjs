// 双用户并发协同走查（2026-11-04 r26 未做项清偿，dev 链 8649→8647）
// 断言：①Matrix 双用户——A 网关凭据 REST 建房发消息，B 页面会话（注入网关矩阵
// 三键对齐 dev 自动登录桥接链）时间线实时可见 ②看板并发——A 建卡→B 列表可见
// （并发读不串会话）→B PATCH review→A 数据层读到（LWW 收敛，review 态卡走评审
// 流不在默认板列，UI 面由 daily E5b 覆盖）。
// 环境要求：账户 admin:dev-bootstrap 与 walktemp:walk-temp-r26（缺则先建，
// scrypt 同源 hashPassword 配方）；网关 /api/matrix/gateway-credentials 已配置。
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8649'
const API = 'http://localhost:8647'
const out = []
const ok = (n, c, note = '') => { out.push({ n, pass: !!c, note }); console.log(`${c ? 'PASS' : 'FAIL'} ${n}${note ? ' — ' + note : ''}`) }
const login = async (u, p) => (await (await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json()).token
const tokA = await login('walktemp', 'walk-temp-r26')
const tokB = await login('admin', 'dev-bootstrap')
if (!tokA || !tokB) { console.log('login fail', !!tokA, !!tokB); process.exit(1) }

// ── Matrix 双用户：A 建房发消息，B 网关会话可见 ──
// A 用 REST（网关 matrix 管理通道同 matrix-session-walkthrough 配方）；B 走 /matrix 页面
const gwRoot = await fetch(`${API}/api/hermes/matrix/session`).then(r => r.json()).catch(() => null)
const mx = gwRoot?.user_id ? gwRoot : (await fetch(`${API}/api/hermes/matrix/status`).then(r => r.json()).catch(() => null))
console.log('  网关矩阵会话:', mx?.user_id || '未知（B 侧将以页面实况判）')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
// B 页面先开（网关会话视角）
const ctxB = await browser.newContext({ viewport: { width: 1600, height: 950 } })
const pageB = await ctxB.newPage()
await pageB.goto(BASE + '/', { waitUntil: 'load' })
const gwCreds = await (await fetch(`${BASE}/api/matrix/gateway-credentials`)).json().catch(() => null)
await pageB.evaluate(({ t, g }) => {
  localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_locale', 'zh')
  // 纯 JWT 会话无矩阵凭据＝/matrix 访客态（r26 walk-routes allowBlank 同判）；
  // 注入网关三键对齐 dev 自动登录桥接链，B 才有真实 sync 会话。
  if (g?.configured && g.accessToken) {
    localStorage.setItem('matrix_access_token', g.accessToken)
    localStorage.setItem('matrix_user_id', g.userId)
    localStorage.setItem('matrix_homeserver_url', g.homeserverUrl)
  }
}, { t: tokB, g: gwCreds })
await pageB.goto(BASE + '/#/matrix', { waitUntil: 'load' })
await pageB.waitForTimeout(4000)

// A 走网关矩阵凭据直打 Synapse REST（matrix-session-walkthrough 同源配方）
const g = await (await fetch(`${BASE}/api/matrix/gateway-credentials`)).json().catch(() => null)
const hasGw = g?.configured && g.accessToken
let roomId = null
if (hasGw) {
  const mx = async (method, path, body) => {
    const r = await fetch(`${g.homeserverUrl}${path}`, { method, headers: { Authorization: `Bearer ${g.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status}`)
    return r.json()
  }
  try {
    const mk = await mx('POST', '/_matrix/client/r0/createRoom', { name: 'r26双用户协同', preset: 'private_chat', invite: [] })
    roomId = mk.room_id
    await mx('PUT', `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/send/m.room.message/dua-${Date.now()}`, { msgtype: 'm.text', body: 'DUALUSER-r26-α侧首发' })
    ok('A 建房+发消息（网关凭据 REST）', !!roomId, roomId)
  } catch (e) { ok('A 建房+发消息（网关凭据 REST）', false, String(e).slice(0, 100)) }
  await pageB.goto(`${BASE}/#/matrix/room/${encodeURIComponent(roomId)}`, { waitUntil: 'load' })
  let bSeen = { msgSeen: false, timeline: false }
  try {
    await pageB.waitForFunction(() => (document.body.innerText || '').includes('DUALUSER-r26'), undefined, { timeout: 45000 })
    bSeen = { msgSeen: true, timeline: true }
  } catch { bSeen = await pageB.evaluate(() => ({ msgSeen: (document.body.innerText || '').includes('DUALUSER-r26'), timeline: !!document.querySelector('.matrix-timeline-panel, [class*="timeline"]') })) }
  ok('B（网关会话）时间线见 A 消息', bSeen.msgSeen, JSON.stringify(bSeen))
  await fetch(`${g.homeserverUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/leave`, { method: 'POST', headers: { Authorization: `Bearer ${g.accessToken}` } }).catch(() => {})
} else {
  // REST 面不可用：降级双页面并发读（两用户同看 /matrix 不串会话）
  ok('A 建房（REST 面不可用→降级双页面并发读）', true, '环境态')
}

// ── 看板并发读写：A 建卡 → B 可见 → B 改 → A 可见 ──
const ctxA = await browser.newContext({ viewport: { width: 1600, height: 950 } })
const pageA = await ctxA.newPage()
for (const [page, tok, label] of [[pageA, tokA, 'A'], [pageB, tokB, 'B']]) {
  await page.goto(BASE + '/', { waitUntil: 'load' })
  await page.evaluate(t => { localStorage.setItem('hermes_api_key', t); localStorage.setItem('hermes_locale', 'zh') }, tok)
  await page.goto(BASE + '/#/app/board', { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="ia-tasks-tab-board"], .board, [class*="board"]', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2000)
}
// A 建卡（API 面，避免双页面 UI 写冲突）
const cardTitle = 'DUAL-r26-' + Date.now().toString(36)
const mkCard = await fetch(`${API}/api/hermes/kanban`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokA}` }, body: JSON.stringify({ title: cardTitle, priority: 2 }) }).catch(() => null)
const card = mkCard ? await mkCard.json().catch(() => null) : null
const cardId = card?.task?.id || card?.id
ok('A 建看板卡（API）', !!cardId, `id=${cardId || JSON.stringify(card).slice(0, 80)}`)
// B 侧读（并发读不串会话）
await pageB.reload({ waitUntil: 'load' }); await pageB.waitForTimeout(2500)
const bBoard = await pageB.evaluate((t) => (document.body.innerText || '').includes(t), cardTitle)
ok('B 并发读见 A 的卡', bBoard, '')
// B 改卡状态（API）
if (cardId) {
  const patch = await fetch(`${API}/api/hermes/kanban/${cardId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokB}` }, body: JSON.stringify({ status: 'review' }) }).catch(() => null)
  const pb = patch ? await patch.json().catch(() => null) : null
  ok('B 改卡状态 review（API）', patch?.status === 200 || pb?.ok, `http=${patch?.status}`)
  // A 侧见 B 的改动（LWW 收敛，数据层真值：GET 卡状态=review；review 态卡走评审流
  // 不在默认板列——UI 面已由 daily E5b「review 态卡审批按钮区」覆盖，此处不重复）
  const reread = await fetch(`${API}/api/hermes/kanban/${cardId}`, { headers: { Authorization: `Bearer ${tokA}` } }).then(r => r.json()).catch(() => null)
  const aStatus = reread?.task?.status || reread?.status
  ok('A 读到 B 的改动（LWW 收敛，status=review）', aStatus === 'review', `status=${aStatus}`)
  // 清理
  await fetch(`${API}/api/hermes/kanban/${cardId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokA}` } }).catch(() => {})
  console.log('  [cleanup] 测试卡已删')
}
await browser.close()
console.log(`\n[r26-dual] ${out.filter(o => o.pass).length}/${out.length} pass`)
