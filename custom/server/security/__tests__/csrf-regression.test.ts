// @vitest-environment node
// overlay/custom/server/security/__tests__/csrf-regression.test.ts
// CSRF 专项回归（2026-11-26 全面复盘批 C，决策 D5）。
// 防线现状（实测锚定，先测后写断言）：
//  1. VULN-05 防回归——JWT/server token 禁走 ?token= 查询串。守卫由补丁 120 安装
//     （HERMES_CUSTOM[SecNoQueryToken]），注入树 requestToken 仅对两个 <img src> 媒体端点
//     保留 query token（浏览器 <img> 无法带自定义 header）；其余路径查询串一律丢弃。
//     纯净（未注入）树没有该守卫——本文件对补丁文本断言两态皆绿，对守卫行为断言
//     仅在注入态生效（skipIf，未注入时给出指引消息）。
//  2. JWT 走 Authorization: Bearer header（HS256、aud=hermes-studio、exp 到期拒）。上游无
//     cookie 会话、无 CSRF token 机制——同源防线=凭据只走浏览器跨站请求不会自动附带的
//     header，跨站伪请求到达时无凭据，被 401 拦下。cookie 形态无认证语义（携带 cookie
//     仍 401），该行为在此钉住。
// 事实源：patches/120-server-restrict-query-token.patch（补丁=单一事实源，先例
// ekko-ui-patch-wiring）＋ 拼合树 auth.ts（requireUserJwt/verifyUserJwt/signUserJwt）。
import { describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHmac } from 'node:crypto'

const root = resolve(__dirname, '../../../..')
const authPath = resolve(root, 'vendor/hermes-studio/packages/server/src/modules/studio/middleware/auth.ts')
const authSource = readFileSync(authPath, 'utf8')
const guardInstalled = authSource.includes('HERMES_CUSTOM[SecNoQueryToken]')

// 用户仓桩：让有效 JWT 走到「凭据正确」与「凭据缺失」的可区分出口（401 vs 放行）。
vi.mock('../../../../vendor/hermes-studio/packages/server/src/modules/studio/repositories/users-store', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const activeSuperAdmin = { id: 1, username: 'sec-regression', role: 'super_admin', status: 'active' }
  return {
    ...actual,
    findUserById: (id: string) => (String(id) === '1' ? activeSuperAdmin : undefined),
    touchUserLogin: () => {},
    listUserProfiles: () => [],
    userCanAccessProfile: () => true,
    getDefaultProfileForUser: () => 'default',
  }
})

const SECRET = 'csrf-regression-secret'
process.env.AUTH_JWT_SECRET = SECRET

const auth = await import('../../../../vendor/hermes-studio/packages/server/src/modules/studio/middleware/auth')

/** koa ctx 最小桩：只铺 requireUserJwt 实际读取的字段。 */
function makeCtx(overrides: { path?: string; method?: string; query?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = overrides.headers ?? {}
  const ctx = {
    path: overrides.path ?? '/api/studio/sessions/list',
    method: overrides.method ?? 'GET',
    query: overrides.query ?? {},
    headers,
    get: (name: string) => headers[name.toLowerCase()] ?? '',
    state: {} as Record<string, unknown>,
    status: 0,
    body: undefined as unknown,
    request: { body: undefined },
    ip: '10.0.0.1',
    req: { socket: { remoteAddress: '10.0.0.1' } },
  }
  return ctx
}

async function runAuth(ctx: ReturnType<typeof makeCtx>) {
  let nextCalled = false
  await auth.requireUserJwt(ctx as never, async () => { nextCalled = true })
  return { status: ctx.status, body: ctx.body, nextCalled, state: ctx.state }
}

const validToken = auth.signUserJwt({ id: 1, username: 'sec-regression', role: 'super_admin' }, SECRET, Date.now(), 3600)

/** 手工造一枚 aud 可控的 HS256 JWT（验证 aud 校验用的是公开格式，非复制内部逻辑）。 */
function craftToken(payload: Record<string, unknown>, secret = SECRET): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = enc({ alg: 'HS256', typ: 'JWT' })
  const body = enc(payload)
  const unsigned = `${header}.${body}`
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`
}

describe('补丁 120 文本锚点（VULN-05，两态皆绿——补丁是单一事实源）', () => {
  const patchPath = resolve(root, 'patches/120-server-restrict-query-token.patch')
  const text = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''

  it('补丁在 series 里且文本带 VULN-05 标记', () => {
    const series = readFileSync(resolve(root, 'patches/series'), 'utf8')
    expect(series).toContain('120-server-restrict-query-token.patch')
    expect(text).toContain('VULN-05')
    expect(text).toContain('HERMES_CUSTOM[SecNoQueryToken]')
  })

  it('删除的正是「无条件的 query token 回退」那行', () => {
    expect(text).toContain("-  return typeof ctx.query.token === 'string' ? ctx.query.token.trim() : ''")
  })

  it('query token 白名单只保留两个图片媒体端点（<img src> 无法带 header）', () => {
    expect(text).toContain("'/api/hermes/media/apikey-image-generate'")
    expect(text).toContain("'/api/hermes/media/grok-image-to-video'")
    const addedLines = text.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    const pathLiterals = addedLines.join('\n').match(/'(\/api\/[^']+)'/g) ?? []
    expect(pathLiterals.filter((p) => p.includes('/media/'))).toHaveLength(2)
  })
})

describe('JWT 走 Authorization header（两态皆绿——上游本有机制）', () => {
  it('Bearer 有效 JWT：放行并落到 ctx.state.user', async () => {
    const r = await runAuth(makeCtx({ headers: { authorization: `Bearer ${validToken}` } }))
    expect(r.status).not.toBe(401)
    expect(r.nextCalled).toBe(true)
    expect((r.state.user as { id: number }).id).toBe(1)
  })

  it('aud 不是 hermes-studio：401', async () => {
    const forged = craftToken({ sub: '1', username: 'sec-regression', role: 'super_admin', type: 'access', aud: 'other-app', iat: 1e9, exp: 2e9 })
    const r = await runAuth(makeCtx({ headers: { authorization: `Bearer ${forged}` } }))
    expect(r.status).toBe(401)
    expect(r.nextCalled).toBe(false)
  })

  it('过期 JWT：401', async () => {
    const expired = auth.signUserJwt({ id: 1, username: 'sec-regression', role: 'super_admin' }, SECRET, Date.now() - 7200_000, 3600)
    const r = await runAuth(makeCtx({ headers: { authorization: `Bearer ${expired}` } }))
    expect(r.status).toBe(401)
    expect(r.nextCalled).toBe(false)
  })

  it('签名不符（异密钥签发/篡改 payload）：401', async () => {
    const wrongSecret = auth.signUserJwt({ id: 1, username: 'sec-regression', role: 'super_admin' }, 'attacker-key', Date.now(), 3600)
    const tampered = `${validToken.slice(0, -6)}XXXXXX`
    for (const token of [wrongSecret, tampered]) {
      const r = await runAuth(makeCtx({ headers: { authorization: `Bearer ${token}` } }))
      expect(r.status, token).toBe(401)
      expect(r.nextCalled, token).toBe(false)
    }
  })

  it('无任何凭据的跨站写请求（CSRF 形态）：401 放不进处理器', async () => {
    const r = await runAuth(makeCtx({ method: 'POST', path: '/api/studio/sessions/batch-delete' }))
    expect(r.status).toBe(401)
    expect(r.nextCalled).toBe(false)
  })

  it('cookie 形态无认证语义：只带 cookie 不带 header 仍 401（钉住「无 cookie 会话机制」）', async () => {
    const r = await runAuth(makeCtx({
      method: 'POST',
      headers: { cookie: `token=${validToken}; other=1` },
    }))
    expect(r.status).toBe(401)
    expect(r.nextCalled).toBe(false)
  })
})

describe('VULN-05：?token= 查询串禁入（守卫行为，需注入态）', () => {
  // 纯净树没有补丁 120 安装的守卫——行为断言只在注入态生效；未注入时跳过并给指引。
  it.skipIf(!guardInstalled)('守卫已随注入树安装（纯净树缺失时跑 npm run ensure-injected）', () => {
    expect(guardInstalled).toBe(true)
    expect(authSource).toContain('const MEDIA_QUERY_TOKEN_PATHS')
  })

  it.skipIf(!guardInstalled)('带 token 的查询串请求被拒：普通路径 query token 被丢弃 → 401', async () => {
    const r = await runAuth(makeCtx({ method: 'POST', query: { token: validToken }, path: '/api/studio/sessions/batch-delete' }))
    expect(r.status).toBe(401)
    expect(r.nextCalled).toBe(false)
  })

  it.skipIf(!guardInstalled)('媒体端点例外仍在：白名单路径 query token 可过认证（收窄例外面=有意识变更）', async () => {
    const r = await runAuth(makeCtx({ path: '/api/hermes/media/apikey-image-generate', query: { token: validToken } }))
    expect(r.status).not.toBe(401)
    expect(r.nextCalled).toBe(true)
    expect((r.state.user as { id: number }).id).toBe(1)
  })

  it.skipIf(!guardInstalled)('媒体端点无 token 仍 401（例外面不等于免认证）', async () => {
    const r = await runAuth(makeCtx({ path: '/api/hermes/media/grok-image-to-video' }))
    expect(r.status).toBe(401)
    expect(r.nextCalled).toBe(false)
  })
})
