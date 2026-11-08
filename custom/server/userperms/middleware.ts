// custom/server/userperms/middleware.ts
// 用户权限变更审计中间件（N02，spec 2026-11-04-agentteams-ledger-items.md；D4：
// 中间件快照而非改写 vendor controller——挂载见 patches/740，升级面最小）。
//
// 捕获端点（vendor 注入态 studio/routes/auth.ts，全部 requireSuperAdmin 保护面）：
//   POST /api/auth/users            createManagedUser   → 初始角色授予+profile 初始绑定
//   PUT  /api/auth/users/:id        updateManagedUser   → 角色变更+profile 绑定增删
//   POST /api/auth/matrix-users     createMatrixUser    → 同上（Matrix 账号）
//   PUT  /api/auth/matrix-users/:id updateMatrixUser    → 同上（Matrix 账号）
// 不在捕获面（非角色/授权变更，仅记录决策不实施）：DELETE 账号（连带全量解绑属
// 账号生命周期）、matrix deactivate/status、reset-password、locked-ips。
//
// 契约（简化版）：中间件先放行（await next()），响应成功（status<400）后按请求体
// 落审计行——role：body.role；grant/revoke：body.profiles 与库中 before 快照的差集。
// before 快照必须在 next() 之前读（controller 在 next() 内已把库改成 to 态）；
// 库不可查（文件缺/表缺/Node 无 node:sqlite）则 from 侧省略——fail-soft，不猜数。
import type { Context, Next } from 'koa'
import { existsSync } from 'fs'
import { appendAuditEntries, type UserPermsAuditEntry } from './audit-store'
import { webuiDbPath } from '../execution-records/coding-detail'

/** 捕获端点形态（方法+路径形态；中间件在 router 之前，ctx.params 未填充，
 *  路径参数从 ctx.path 正则捕获）。 */
export type AuditedEndpointKind = 'local-create' | 'local-update' | 'matrix-create' | 'matrix-update'

export interface AuditedEndpoint {
  method: 'POST' | 'PUT'
  pattern: RegExp
  kind: AuditedEndpointKind
}

export const AUDITED_ENDPOINTS: AuditedEndpoint[] = [
  { method: 'POST', pattern: /^\/api\/auth\/users$/, kind: 'local-create' },
  { method: 'PUT', pattern: /^\/api\/auth\/users\/([^/]+)$/, kind: 'local-update' },
  { method: 'POST', pattern: /^\/api\/auth\/matrix-users$/, kind: 'matrix-create' },
  { method: 'PUT', pattern: /^\/api\/auth\/matrix-users\/([^/]+)$/, kind: 'matrix-update' },
]

/** before 快照：变更前的账号角色与 profile 绑定（读不到=不存在或库不可查）。 */
export interface UserBeforeSnapshot {
  id: number
  username: string
  role: string
  profiles: string[]
}

/** 单值请求体成员（koa body 可能是数组/对象——非串不猜）。 */
function bodyString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** 请求体 profiles 归一（逐条镜像 vendor normalizeProfiles，controllers/auth.ts:641：
 *  非数组→[]＝清空绑定、falsy 项丢弃、其余 String()+trim、去重）。
 *  返回 null=请求体未提供该字段（不变更，无审计行）。 */
function normalizedProfiles(v: unknown): string[] | null {
  if (v == null) return null
  if (!Array.isArray(v)) return []
  return [...new Set(v.map((item) => String(item || '').trim()).filter(Boolean))]
}

/** 库中 before 快照读取器（默认实现=只读 sqlite；测试可注入替身）。 */
export type BeforeReader = (kind: AuditedEndpointKind, key: string) => UserBeforeSnapshot | null

function defaultBeforeReader(kind: AuditedEndpointKind, key: string): UserBeforeSnapshot | null {
  let db: {
    prepare(sql: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown }
    close(): void
  } | null = null
  try {
    // node:sqlite 惰性加载（照 execution-records/coding-detail 范式）；
    // webuiDbPath 复用 execution-records 导出——库路径单一事实源，不在本域重复实现。
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (p: string, o?: unknown) => NonNullable<typeof db>
    }
    const dbPath = webuiDbPath()
    if (!existsSync(dbPath)) return null
    db = new DatabaseSync(dbPath, { readOnly: true })
    // 锚点 vendor schemas.ts USERS_SCHEMA/USER_PROFILES_SCHEMA（users/user_profiles 两表）
    // 显式三分支 SQL（2026-11-08 security 门白名单化批）：列名消插值——静态可判。
    const row = (
      kind === 'local-update'
        ? db.prepare('SELECT id, username, role FROM users WHERE id = ? LIMIT 1').get(Number(key))
        : kind === 'local-create'
          ? db.prepare('SELECT id, username, role FROM users WHERE username = ? LIMIT 1').get(key)
          : db.prepare('SELECT id, username, role FROM users WHERE matrix_user_id = ? LIMIT 1').get(key)
    ) as
      | { id: number; username: string; role: string }
      | undefined
    if (!row) return null
    const profiles = db.prepare(
      'SELECT profile_name FROM user_profiles WHERE user_id = ?',
    ).all(row.id) as Array<{ profile_name: string }>
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      profiles: profiles.map((p) => p.profile_name),
    }
  } catch {
    // 库缺/表缺/node:sqlite 不可用：from 侧省略（fail-soft，不阻断请求）
    return null
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

let beforeReader: BeforeReader = defaultBeforeReader

/** 按端点形态解析 before 快照的查找键（local-update=数字 id；matrix=解码后的
 *  matrix user id；create=请求体 username/userId——创建前查无此账号=快照 null）。 */
function lookupKey(kind: AuditedEndpointKind, ctx: Context, rawPathId: string | null): string | null {
  const body = (ctx.request as { body?: unknown }).body as Record<string, unknown> | undefined
  if (kind === 'local-update') {
    return rawPathId != null && /^\d+$/.test(rawPathId) ? rawPathId : null
  }
  if (kind === 'matrix-update') {
    if (rawPathId == null) return null
    try { return decodeURIComponent(rawPathId) } catch { return rawPathId }
  }
  if (kind === 'local-create') return bodyString(body?.username)
  return bodyString(body?.userId) // matrix-create：body.userId = matrix 全名
}

export function matchAuditedEndpoint(method: string, path: string): { endpoint: AuditedEndpoint; pathId: string | null } | null {
  for (const endpoint of AUDITED_ENDPOINTS) {
    if (endpoint.method !== method) continue
    const m = endpoint.pattern.exec(path)
    if (m) return { endpoint, pathId: m[1] ?? null }
  }
  return null
}

/** 审计中间件本体。挂载位置（patch 740）：全局 authMiddleware 之后、
 *  authProtectedRoutes.routes() 之前——保证 ctx.state.user 已填充（actor 可取）
 *  且先于用户管理路由拿到请求。 */
export async function userPermsAuditMiddleware(ctx: Context, next: Next): Promise<void> {
  const hit = matchAuditedEndpoint(ctx.method, ctx.path)
  if (!hit) {
    await next()
    return
  }
  const key = lookupKey(hit.endpoint.kind, ctx, hit.pathId)
  if (key == null) {
    // 路径参数不可归因（如本地用户 id 非数字）：controller 必然 404/400，
    // 无法定位被改账号，直接放行不落审计
    await next()
    return
  }
  // before 必须在 next() 前读：controller 在 next() 内落库，之后只剩 to 态
  const before = beforeReader(hit.endpoint.kind, key)
  await next()
  // 失败响应（含 4xx 校验拒绝与 5xx）不落行——只记生效的权限变更
  if (ctx.status >= 400) return

  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const state = ctx.state as { user?: { username?: unknown } } | undefined
  const actor = bodyString(state?.user?.username) ?? 'unknown'
  const requestId = bodyString(ctx.get('x-request-id')) ?? undefined
  const user = before?.username ?? key
  const at = Date.now()
  const rows: UserPermsAuditEntry[] = []

  const roleRaw = body.role
  if (roleRaw != null) {
    rows.push({
      at,
      actor,
      action: 'role_change',
      user,
      ...(before ? { from: before.role } : {}), // 库不可查则 from 省略（fail-soft）
      to: String(roleRaw),
      ...(requestId ? { requestId } : {}),
    })
  }

  const toProfiles = normalizedProfiles(body.profiles)
  if (toProfiles != null) {
    // 镜像 vendor 规则（controllers/auth.ts createManagedUser/updateManagedUser）：
    // super_admin 不持有 profile 绑定（profiles 置空），to 侧按同规则收敛
    const nextRole = roleRaw != null ? String(roleRaw) : before?.role
    const toList = nextRole === 'super_admin' ? [] : toProfiles
    const beforeList = before?.profiles
    if (beforeList) {
      for (const p of toList) {
        if (!beforeList.includes(p)) {
          rows.push({ at, actor, action: 'profile_grant', user, target: p, ...(requestId ? { requestId } : {}) })
        }
      }
      for (const p of beforeList) {
        if (!toList.includes(p)) {
          rows.push({ at, actor, action: 'profile_revoke', user, target: p, ...(requestId ? { requestId } : {}) })
        }
      }
    } else {
      // 创建（或库不可查）：只有 to 侧可证，逐项记 grant；from 侧无从判定不猜
      for (const p of toList) {
        rows.push({ at, actor, action: 'profile_grant', user, target: p, ...(requestId ? { requestId } : {}) })
      }
    }
  }

  appendAuditEntries(rows)
}

/** 测试注入 before 读取器（null 恢复默认）。 */
export function _setBeforeReaderForTests(reader: BeforeReader | null): void {
  beforeReader = reader ?? defaultBeforeReader
}
