// S1 守门：GET /api/matrix/gateway-credentials 来源约束——仅 TCP 对端是 loopback
// （127.0.0.1 / ::1 / ::ffff:127.0.0.1）才返回 gateway 凭据三元组，其余 403。
// 该路由挂在鉴权中间件之前、服务默认绑 0.0.0.0，来源约束是唯一防线。
// G3 加固：转发头（X-Forwarded-For/Forwarded）非回环客户端拒绝（本机代理放大面）、
// Origin/Host 白名单（DNS rebinding 面）；详见 routes.ts 威胁模型注释。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Koa from 'koa'
import { registerMatrixAuthRoutes } from '../routes'

function routesMiddleware(): (ctx: Record<string, unknown>) => Promise<void> {
  const used: Array<(ctx: never, next: () => Promise<void>) => Promise<void>> = []
  const app = { use: (fn: (ctx: never, next: () => Promise<void>) => Promise<void>) => used.push(fn) } as unknown as Koa
  registerMatrixAuthRoutes(app)
  return used[0] as never
}

function fakeCtx(remoteAddress: string | undefined, headers: Record<string, string> = {}): Record<string, unknown> {
  return {
    method: 'GET',
    path: '/api/matrix/gateway-credentials',
    url: '/api/matrix/gateway-credentials',
    state: {},
    request: { socket: { remoteAddress }, headers },
    status: 200,
    body: undefined,
  }
}

describe('gateway-credentials 来源约束（S1）', () => {
  let hermesHome: string
  const savedHome = process.env.HERMES_HOME

  beforeEach(() => {
    hermesHome = mkdtempSync(join(tmpdir(), 'gw-routes-test-'))
    const profileDir = join(hermesHome, 'profiles', 'orchestrator')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, '.env'), [
      'MATRIX_HOMESERVER=https://ms.example.org',
      'MATRIX_ACCESS_TOKEN=syt_secret_token',
      'MATRIX_USER_ID=@gw:ms.example.org',
    ].join('\n'))
    process.env.HERMES_HOME = hermesHome
  })

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = savedHome
    rmSync(hermesHome, { recursive: true, force: true })
  })

  it('loopback 对端（127.0.0.1 / ::1 / ::ffff:127.0.0.1）返回凭据三元组', async () => {
    const mw = routesMiddleware()
    for (const addr of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      const ctx = fakeCtx(addr)
      await mw(ctx as never)
      expect(ctx.status, addr).toBe(200)
      expect(ctx.body, addr).toMatchObject({
        configured: true,
        homeserverUrl: 'https://ms.example.org',
        accessToken: 'syt_secret_token',
        userId: '@gw:ms.example.org',
      })
    }
  })

  it('非 loopback 对端 403，不回任何凭据', async () => {
    const mw = routesMiddleware()
    for (const addr of ['192.168.1.10', '10.0.0.5', '172.16.0.9', '::ffff:192.168.1.10', undefined]) {
      const ctx = fakeCtx(addr)
      await mw(ctx as never)
      expect(ctx.status, String(addr)).toBe(403)
      expect(JSON.stringify(ctx.body), String(addr)).not.toContain('syt_secret_token')
    }
  })

  it('loopback 对端 + 无转发头（curl/本机直连）放行', async () => {
    const mw = routesMiddleware()
    const ctx = fakeCtx('127.0.0.1', { host: '127.0.0.1:8647' })
    await mw(ctx as never)
    expect(ctx.status).toBe(200)
    expect(ctx.body).toMatchObject({ configured: true })
  })

  it('loopback 对端 + XFF 外网客户端 403（本机代理放大面）；XFF 回环链放行', async () => {
    const mw = routesMiddleware()
    const lanViaProxy = fakeCtx('127.0.0.1', { host: '127.0.0.1:8647', 'x-forwarded-for': '192.168.1.5' })
    await mw(lanViaProxy as never)
    expect(lanViaProxy.status).toBe(403)
    expect(JSON.stringify(lanViaProxy.body)).not.toContain('syt_secret_token')
    const spoofedChain = fakeCtx('127.0.0.1', { host: '127.0.0.1:8647', 'x-forwarded-for': '127.0.0.1, 192.168.1.5' })
    await mw(spoofedChain as never)
    expect(spoofedChain.status).toBe(403)
    const localProxy = fakeCtx('127.0.0.1', { host: '127.0.0.1:8647', 'x-forwarded-for': '127.0.0.1' })
    await mw(localProxy as never)
    expect(localProxy.status).toBe(200)
  })

  it('Forwarded（RFC 7239）外网客户端同样 403', async () => {
    const mw = routesMiddleware()
    const ctx = fakeCtx('127.0.0.1', { host: '127.0.0.1:8647', forwarded: 'for=192.168.1.5;proto=http' })
    await mw(ctx as never)
    expect(ctx.status).toBe(403)
  })

  it('Origin/Host 白名单：非回环 Origin/Host 403（DNS rebinding 面），回环 Origin 放行', async () => {
    const mw = routesMiddleware()
    for (const headers of [
      { host: '127.0.0.1:8647', origin: 'http://evil.example.com:8647' },
      { host: 'evil.example.com:8647' },
      { host: '127.0.0.1:8647', origin: 'not-a-url' },
    ]) {
      const ctx = fakeCtx('127.0.0.1', headers)
      await mw(ctx as never)
      expect(ctx.status, JSON.stringify(headers)).toBe(403)
      expect(JSON.stringify(ctx.body), JSON.stringify(headers)).not.toContain('syt_secret_token')
    }
    for (const headers of [
      { host: 'localhost:8649', origin: 'http://localhost:8649' },
      { host: '127.0.0.1:8647', origin: 'http://127.0.0.1:8647' },
    ]) {
      const ctx = fakeCtx('127.0.0.1', headers)
      await mw(ctx as never)
      expect(ctx.status, JSON.stringify(headers)).toBe(200)
    }
  })
})
