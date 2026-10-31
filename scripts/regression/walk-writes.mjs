// 写流与权限矩阵验收：在真实 API 上做可逆写回路（临时板→建卡→真实状态迁移→running 显式拒绝→删卡→删板→复核消失），
// 并验证受保护端点对无凭据/坏凭据必须 401。
// 用法：API_BASE=http://127.0.0.1:8655 WALK_LOGIN=admin:dev-bootstrap node scripts/regression/walk-writes.mjs
// 对象全部带 walkthrough- 前缀；开跑先清残留，任何失败也走清理路径（REST 归档 + CLI 硬删兜底）。退出码非 0=失败。
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.API_BASE || 'http://127.0.0.1:8647'
const LOGIN = process.env.WALK_LOGIN || 'admin:dev-bootstrap'
const SLUG = `walkthrough-${Date.now().toString(36)}`
const HERMES_CLI = resolve(import.meta.dirname, '../../vendor/hermes-agent/hermes')
const results = []
function ok(name, cond, note = '') {
  results.push({ name, pass: !!cond, note })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 非 JSON 响应按原文处理 */ }
  return { status: res.status, json, text }
}

async function login() {
  // API_TOKEN 直给已铸 JWT（回归轮 super_admin 会话）；缺省仍走口令换 JWT。
  const preset = process.env.API_TOKEN?.trim()
  if (preset) return preset
  const [username, password] = LOGIN.split(/:(.+)/)
  const r = await api('/api/auth/login', { method: 'POST', body: { username, password } })
  return r.json?.token || r.json?.jwt || null
}

/** CLI 硬删（boards rm --delete）：REST DELETE 是归档（可恢复），验收残留用官方硬删通道兜底。 */
function cliHardDelete(slug) {
  if (!existsSync(HERMES_CLI)) return `CLI 缺席（${HERMES_CLI}）`
  const r = spawnSync('python3', [HERMES_CLI, 'kanban', 'boards', 'rm', '--delete', slug], { encoding: 'utf8', timeout: 60_000 })
  return r.status === 0 ? 'hard-deleted' : `CLI rc=${r.status}: ${(r.stderr || r.stdout || '').slice(0, 80)}`
}

/** 清理：REST 归档本脚本前缀的板（含历史残留），再 CLI 硬删兜底；失败不阻断（下一次运行再兜）。 */
async function cleanup(token) {
  if (!token) return
  const r = await api('/api/hermes/kanban/boards?includeArchived=true', { token })
  for (const b of r.json?.boards ?? []) {
    if (String(b.slug || '').startsWith('walkthrough-')) {
      await api(`/api/hermes/kanban/boards/${encodeURIComponent(b.slug)}`, { method: 'DELETE', token }).catch(() => {})
      cliHardDelete(b.slug)
    }
  }
}

let token = null
try {
  token = await login()
  ok('登录换取 JWT', !!token, token ? 'token 已取得' : '凭据被拒（WALK_LOGIN/API_BASE 正确吗）')
  if (!token) throw new Error('登录失败，后续无法进行')

  // ── 权限矩阵：受保护端点无凭据/坏凭据必须 401 ──
  const noToken = await api('/api/hermes/kanban/boards')
  ok('无 token 访问看板列表 → 401', noToken.status === 401, `实际 ${noToken.status}`)
  const badToken = await api('/api/hermes/kanban/boards', { token: 'not-a-jwt' })
  ok('坏 token 访问看板列表 → 401', badToken.status === 401, `实际 ${badToken.status}`)
  const noTokenWrite = await api('/api/hermes/kanban/boards', { method: 'POST', body: { slug: 'walkthrough-should-never-exist' } })
  ok('无 token 建板 → 401', noTokenWrite.status === 401, `实际 ${noTokenWrite.status}`)

  // ── 写回路 ──
  await cleanup(token)
  const boardQ = `board=${encodeURIComponent(SLUG)}`
  const created = await api('/api/hermes/kanban/boards', { token, method: 'POST', body: { slug: SLUG, name: '走查写回路临时板' } })
  ok('建临时板', created.status === 200 || created.status === 201, `POST /boards → ${created.status} ${created.text?.slice(0, 80)}`)
  if (!created.json?.board) throw new Error('建板未返回 board')

  const task = await api(`/api/hermes/kanban?${boardQ}`, {
    token, method: 'POST', body: { title: '走查写回路卡', priority: 1, assignee: 'admin' },
  })
  ok('建卡', !!task.json?.task?.id, `POST /kanban → ${task.status} ${task.text?.slice(0, 80)}`)
  const taskId = task.json?.task?.id
  if (!taskId) throw new Error('建卡未返回 task.id')

  // 真实状态迁移（服务端状态机支持的动词链）：blocked → ready
  const blocked = await api(`/api/hermes/kanban/${encodeURIComponent(taskId)}?${boardQ}`, {
    token, method: 'PATCH', body: { status: 'blocked', block_reason: '走查回路演示' },
  })
  ok('改卡状态 →blocked（真实迁移）', blocked.json?.task?.status === 'blocked', `PATCH → ${blocked.status} status=${blocked.json?.task?.status}`)

  const readied = await api(`/api/hermes/kanban/${encodeURIComponent(taskId)}?${boardQ}`, {
    token, method: 'PATCH', body: { status: 'ready' },
  })
  ok('改卡状态 blocked→ready（unblock）', readied.json?.task?.status === 'ready', `PATCH → ${readied.status} status=${readied.json?.task?.status}`)

  const got = await api(`/api/hermes/kanban/${encodeURIComponent(taskId)}?${boardQ}`, { token })
  ok('回读卡与改动一致', got.json?.task?.status === 'ready', `GET → ${got.status}`)

  // running 显式拒绝（补丁 692：running 由 worker 领卡进入，PATCH 不再静默 no-op）
  const running = await api(`/api/hermes/kanban/${encodeURIComponent(taskId)}?${boardQ}`, {
    token, method: 'PATCH', body: { status: 'running' },
  })
  ok('PATCH status running 显式拒绝（fail-loud，补丁 692）',
    running.status >= 400 && /worker claim/.test(String(running.json?.error || running.text)),
    `→ ${running.status} ${String(running.json?.error || running.text).slice(0, 90)}`)

  const del = await api(`/api/hermes/kanban/${encodeURIComponent(taskId)}?${boardQ}`, { token, method: 'DELETE' })
  ok('删卡（archive --rm + purge 硬删）', del.json?.ok === true, `DELETE → ${del.status} ${del.text?.slice(0, 60)}`)

  const gone = await api(`/api/hermes/kanban/${encodeURIComponent(taskId)}?${boardQ}`, { token })
  ok('删后回读 → 404（快道 fast-404）', gone.status === 404, `实际 ${gone.status}`)

  // 删板：REST DELETE = 归档（可恢复，官方语义）——默认列表消失、归档视图保留
  const delBoard = await api(`/api/hermes/kanban/boards/${encodeURIComponent(SLUG)}`, { token, method: 'DELETE' })
  ok('删临时板（归档语义）', delBoard.status === 200 || delBoard.json?.ok === true, `DELETE /boards → ${delBoard.status}`)

  const defaultList = await api('/api/hermes/kanban/boards', { token })
  ok('板已从默认列表消失', !(defaultList.json?.boards ?? []).some(b => b.slug === SLUG), '')
  const archivedList = await api('/api/hermes/kanban/boards?includeArchived=true', { token })
  ok('归档视图保留（可恢复，符合 boards rm 语义）', (archivedList.json?.boards ?? []).some(b => b.slug === SLUG), '')

  ok('CLI 硬删清残留', cliHardDelete(SLUG) === 'hard-deleted', '')
} catch (error) {
  ok('脚本执行不中断', false, String(error).slice(0, 160))
} finally {
  await cleanup(token).catch(() => {})
}

const failed = results.filter(r => !r.pass)
console.log(`\n[walk-writes] ${results.length - failed.length}/${results.length} pass`)
process.exit(failed.length ? 1 : 0)
