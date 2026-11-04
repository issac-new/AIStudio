// custom/server/userperms/__tests__/userperms.test.ts
// N02 用户权限变更审计域测试（spec 2026-11-04-agentteams-ledger-items.md）。
//
// 覆盖：
// - audit-store：追加/查询过滤/limit clamp 1..500/offset+hasMore/脱敏红线
//   （审计行内不得出现密码类字段——白名单序列化）。
// - middleware：mock koa ctx——匹配端点+成功响应落行（role from→to、grant/revoke
//   差集、super_admin 镜像清空、创建无 from）；非匹配端点/4xx 不落。
// - controller：查询端点参数解析与响应形状。
// - patches/740 接线标记断言（防补丁静默漂移；正/反向 apply 属注入链自验，
//   本文件只锁接线痕迹）。
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetUserPermsAuditStateForTests,
  appendAuditEntries,
  queryAudit,
  readAuditEntries,
  userPermsAuditFile,
  type UserPermsAuditEntry,
} from '../audit-store'
import {
  _setBeforeReaderForTests,
  userPermsAuditMiddleware,
  type BeforeReader,
  type UserBeforeSnapshot,
} from '../middleware'
import { userPermsAuditQueryHandler } from '../controller'

// ---------------------------------------------------------------------------
// 测试基建
// ---------------------------------------------------------------------------

let auditDir: string

beforeEach(() => {
  auditDir = mkdtempSync(join(tmpdir(), 'userperms-audit-'))
  process.env.USER_PERMS_AUDIT_FILE = join(auditDir, 'user-perms-audit.jsonl')
  _resetUserPermsAuditStateForTests()
})

afterEach(() => {
  _setBeforeReaderForTests(null)
  delete process.env.USER_PERMS_AUDIT_FILE
  rmSync(auditDir, { recursive: true, force: true })
})

/** mock koa ctx（中间件只访问这些面；get() 支持 x-request-id）。 */
function makeCtx(opts: {
  method: string
  path: string
  body?: unknown
  status?: number
  username?: string
  requestId?: string
}) {
  const ctx = {
    method: opts.method,
    path: opts.path,
    request: { body: opts.body },
    state: { user: { username: opts.username ?? 'root-admin' } },
    status: opts.status ?? 200,
    headers: opts.requestId ? { 'x-request-id': opts.requestId } : {},
    get(name: string) {
      return (this.headers as Record<string, string>)[name.toLowerCase()] ?? ''
    },
  }
  const next = async () => {
    ctx.status = opts.status ?? 200
  }
  return { ctx, next }
}

/** 注入 before 快照替身（key → 快照；缺省查无=null）。 */
function injectBefore(map: Record<string, UserBeforeSnapshot>): void {
  const reader: BeforeReader = (_kind, key) => map[key] ?? null
  _setBeforeReaderForTests(reader)
}

async function run(opts: Parameters<typeof makeCtx>[0]) {
  const { ctx, next } = makeCtx(opts)
  await userPermsAuditMiddleware(ctx as never, next)
  return ctx
}

// ---------------------------------------------------------------------------
// audit-store
// ---------------------------------------------------------------------------

describe('audit-store 追加与查询', () => {
  it('追加多行落盘且倒序（新→旧）读回', () => {
    appendAuditEntries([
      { at: 1000, actor: 'a1', action: 'role_change', user: 'alice', from: 'admin', to: 'super_admin' },
      { at: 2000, actor: 'a1', action: 'profile_grant', user: 'alice', target: 'team' },
      { at: 3000, actor: 'a2', action: 'profile_revoke', user: 'bob', target: 'default' },
    ])
    const entries = readAuditEntries()
    expect(entries).toHaveLength(3)
    expect(queryAudit().entries[0].at).toBe(3000) // 最新在前
    expect(queryAudit().entries.map((e) => e.at)).toEqual([3000, 2000, 1000])
  })

  it('按 user 与 action 过滤', () => {
    appendAuditEntries([
      { at: 1000, actor: 'a1', action: 'role_change', user: 'alice', to: 'admin' },
      { at: 2000, actor: 'a1', action: 'profile_grant', user: 'alice', target: 't1' },
      { at: 3000, actor: 'a2', action: 'profile_grant', user: 'bob', target: 't2' },
    ])
    expect(queryAudit({ user: 'alice' }).total).toBe(2)
    expect(queryAudit({ action: 'profile_grant' }).total).toBe(2)
    expect(queryAudit({ user: 'alice', action: 'role_change' }).total).toBe(1)
  })

  it('limit clamp 1..500：0→1、超大→500，offset 翻页 hasMore 正确', () => {
    const batch: UserPermsAuditEntry[] = []
    for (let i = 1; i <= 502; i++) {
      batch.push({ at: i, actor: 'a', action: 'role_change', user: `u${i}`, to: 'admin' })
    }
    appendAuditEntries(batch)
    expect(queryAudit({ limit: 0 }).entries).toHaveLength(1) // 下限 1
    expect(queryAudit({ limit: 100000 }).entries).toHaveLength(500) // 上限 500
    expect(queryAudit({ limit: 100000 }).hasMore).toBe(true)
    const page1 = queryAudit({ limit: 2, offset: 0 })
    expect(page1.entries.map((e) => e.at)).toEqual([502, 501])
    expect(page1.hasMore).toBe(true)
    const page2 = queryAudit({ limit: 2, offset: 500 })
    expect(page2.entries.map((e) => e.at)).toEqual([2, 1])
    expect(page2.hasMore).toBe(false)
  })

  it('脱敏红线：白名单外的密码类字段不落审计行', () => {
    // 恶意/误用调用方混入敏感字段——序列化按 AUDIT_ENTRY_KEYS 白名单投影
    appendAuditEntries([
      {
        at: 1234,
        actor: 'a',
        action: 'role_change',
        user: 'alice',
        to: 'admin',
        password: 'hunter2',
        passwordHash: 'scrypt:aa:bb',
        password_hash: 'scrypt:cc:dd',
      } as UserPermsAuditEntry,
    ])
    const line = readFileSync(userPermsAuditFile(), 'utf8')
    expect(line).toContain('"user":"alice"')
    expect(line).not.toContain('password')
    expect(line).not.toContain('hunter2')
    expect(line).not.toContain('scrypt')
  })

  it('坏行跳过、文件不存在按空账（fail-soft）', () => {
    expect(readAuditEntries()).toEqual([]) // 文件尚不存在
    const { appendFileSync, writeFileSync } = require('fs') as typeof import('fs')
    appendFileSync(userPermsAuditFile(), '{not-json}\n')
    appendFileSync(userPermsAuditFile(), JSON.stringify({ at: 1, actor: 'a', action: 'role_change', user: 'u', to: 'admin' }) + '\n')
    expect(readAuditEntries()).toHaveLength(1)
    writeFileSync(userPermsAuditFile(), '')
    expect(queryAudit().total).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// middleware
// ---------------------------------------------------------------------------

describe('userPermsAuditMiddleware 端点匹配与落行', () => {
  it('PUT /api/auth/users/:id 成功：role from→to + profile 差集（grant/revoke）', async () => {
    injectBefore({
      '7': { id: 7, username: 'alice', role: 'admin', profiles: ['default', 'team'] },
    })
    await run({
      method: 'PUT',
      path: '/api/auth/users/7',
      body: { role: 'admin', profiles: ['default', 'ops'] },
      requestId: 'req-1',
    })
    const rows = readAuditEntries()
    expect(rows).toHaveLength(3)
    const roleRow = rows.find((r) => r.action === 'role_change')!
    expect(roleRow).toMatchObject({ actor: 'root-admin', user: 'alice', from: 'admin', to: 'admin', requestId: 'req-1' })
    const grants = rows.filter((r) => r.action === 'profile_grant').map((r) => r.target)
    const revokes = rows.filter((r) => r.action === 'profile_revoke').map((r) => r.target)
    expect(grants).toEqual(['ops'])
    expect(revokes).toEqual(['team'])
  })

  it('角色升为 super_admin：镜像 vendor 规则清空 profile 绑定（只 revoke 不 grant）', async () => {
    injectBefore({
      '7': { id: 7, username: 'alice', role: 'admin', profiles: ['default'] },
    })
    await run({
      method: 'PUT',
      path: '/api/auth/users/7',
      body: { role: 'super_admin', profiles: ['default', 'x'] },
    })
    const rows = readAuditEntries()
    expect(rows.find((r) => r.action === 'role_change')).toMatchObject({ from: 'admin', to: 'super_admin' })
    expect(rows.filter((r) => r.action === 'profile_grant')).toHaveLength(0) // super_admin 不持绑定
    expect(rows.filter((r) => r.action === 'profile_revoke').map((r) => r.target)).toEqual(['default'])
  })

  it('POST /api/auth/users 创建：before 查无→from 省略、逐 profile 记 grant', async () => {
    injectBefore({}) // 创建前库中无此账号
    await run({
      method: 'POST',
      path: '/api/auth/users',
      body: { username: 'bob', password: 'secret-should-not-land', role: 'admin', profiles: ['p1', 'p2'] },
    })
    const rows = readAuditEntries()
    const createRoleRow = rows.find((r) => r.action === 'role_change')!
    expect(createRoleRow).toMatchObject({ user: 'bob', to: 'admin' })
    expect('from' in createRoleRow).toBe(false) // 创建前查无 before：from 整键省略
    expect(rows.filter((r) => r.action === 'profile_grant').map((r) => r.target).sort()).toEqual(['p1', 'p2'])
    // 脱敏红线：请求体里的 password 不落审计
    expect(readFileSync(userPermsAuditFile(), 'utf8')).not.toContain('secret-should-not-land')
  })

  it('PUT /api/auth/matrix-users/:id：matrix id 解码后定位、只改 displayName 不落行', async () => {
    injectBefore({
      '@carol:hs.example': { id: 9, username: 'carol', role: 'admin', profiles: ['default'] },
    })
    await run({
      method: 'PUT',
      path: '/api/auth/matrix-users/%40carol%3Ahs.example',
      body: { profiles: ['default', 'mx1'] },
    })
    expect(readAuditEntries().map((r) => r.action)).toEqual(['profile_grant'])
    expect(readAuditEntries()[0]).toMatchObject({ user: 'carol', target: 'mx1' })

    await run({
      method: 'PUT',
      path: '/api/auth/matrix-users/%40carol%3Ahs.example',
      body: { displayName: '新名字' }, // 非角色/授权字段
    })
    expect(readAuditEntries()).toHaveLength(1) // 仍只有上一轮那 1 行
  })

  it('非匹配端点不落行（方法/路径都不匹配）', async () => {
    injectBefore({ '7': { id: 7, username: 'alice', role: 'admin', profiles: [] } })
    await run({ method: 'GET', path: '/api/auth/users/7' })
    await run({ method: 'PUT', path: '/api/auth/users' }) // PUT 无 id（无此路由）
    await run({ method: 'PUT', path: '/api/auth/locked-ips/7' })
    await run({ method: 'DELETE', path: '/api/auth/users/7' })
    expect(existsSync(userPermsAuditFile())).toBe(false)
  })

  it('4xx 响应不落行（vendor 校验拒绝=未生效的变更）', async () => {
    injectBefore({
      '7': { id: 7, username: 'alice', role: 'admin', profiles: [] },
    })
    await run({
      method: 'PUT',
      path: '/api/auth/users/7',
      body: { role: 'super_admin', profiles: ['x'] },
      status: 400,
    })
    expect(existsSync(userPermsAuditFile())).toBe(false)
  })

  it('profiles 非数组（vendor 语义=清空绑定）：全部 before 记 revoke', async () => {
    // 镜像锚点 vendor normalizeProfiles（controllers/auth.ts:641）：非数组→[]，
    // controller 会把绑定替换为空——审计侧须记全量 revoke，不得静默漏拍
    injectBefore({
      '7': { id: 7, username: 'dave', role: 'admin', profiles: ['p1', 'p2'] },
    })
    await run({
      method: 'PUT',
      path: '/api/auth/users/7',
      body: { profiles: 'oops-not-array' },
    })
    const rows = readAuditEntries()
    expect(rows.filter((r) => r.action === 'profile_revoke').map((r) => r.target).sort()).toEqual(['p1', 'p2'])
    expect(rows.filter((r) => r.action === 'profile_grant')).toHaveLength(0)
  })

  it('本地 id 非数字：不可归因直接放行不落行', async () => {
    await run({ method: 'PUT', path: '/api/auth/users/abc', body: { role: 'admin' } })
    expect(existsSync(userPermsAuditFile())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// controller
// ---------------------------------------------------------------------------

describe('GET /api/userperms/audit 查询端点', () => {
  it('过滤参数生效、响应形状 ok({entries,total,hasMore})', async () => {
    appendAuditEntries([
      { at: 1000, actor: 'a1', action: 'role_change', user: 'alice', to: 'admin' },
      { at: 2000, actor: 'a1', action: 'profile_grant', user: 'alice', target: 't1' },
      { at: 3000, actor: 'a2', action: 'profile_grant', user: 'bob', target: 't2' },
    ])
    const ctx = {
      query: { user: 'alice', action: 'profile_grant', limit: '10', offset: '0' },
      status: 0,
      body: null as unknown,
    }
    await userPermsAuditQueryHandler(ctx as never)
    expect(ctx.status).toBe(200)
    expect(ctx.body).toEqual({
      ok: true,
      entries: [{ at: 2000, actor: 'a1', action: 'profile_grant', user: 'alice', target: 't1' }],
      total: 1,
      hasMore: false,
    })
  })

  it('非法 action 400（白名单外不静默空结果）', async () => {
    const ctx = {
      query: { action: 'password_spray' },
      status: 0,
      body: null as unknown,
    }
    await userPermsAuditQueryHandler(ctx as never)
    expect(ctx.status).toBe(400)
    expect(ctx.body).toMatchObject({ ok: false, code: 'invalid_action' })
  })
})

// ---------------------------------------------------------------------------
// patches/740 接线标记断言
// ---------------------------------------------------------------------------

describe('patches/740 接线标记断言', () => {
  // 标记断言：只证明补丁文件仍携带接线痕迹（import + 两个挂载点），防补丁被
  // 静默洗掉/漂移；补丁语义级验证（正/反向 apply、干净树重放）属注入链自验。
  const patchPath = resolve(__dirname, '../../../../patches/740-server-userperms-audit.patch')
  const patchText = readFileSync(patchPath, 'utf8')

  it('补丁含 custom 相对 import 行（中间件+查询路由）', () => {
    expect(patchText).toContain("import { userPermsAuditMiddleware } from '../custom/userperms/middleware'")
    expect(patchText).toContain("import { userPermsAuditRoutes } from '../custom/userperms/controller'")
  })

  it('补丁含审计中间件挂载行（authProtectedRoutes 之前）与查询路由挂载行', () => {
    expect(patchText).toContain('app.use(userPermsAuditMiddleware)')
    expect(patchText).toContain('app.use(userPermsAuditRoutes.routes())')
    // 挂载次序：中间件行必须在 authProtectedRoutes 行之前（路由先答=审计漏拍）
    const middlewareAt = patchText.indexOf('app.use(userPermsAuditMiddleware)')
    const protectedAt = patchText.indexOf('app.use(authProtectedRoutes.routes())')
    expect(protectedAt).toBeGreaterThan(0)
    expect(middlewareAt).toBeGreaterThan(0)
    expect(middlewareAt).toBeLessThan(protectedAt)
  })
})
