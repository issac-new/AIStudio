// Cua REST 端点守门（native-routes 原生中间件路径）：status/session 查写、
// PUT 参数校验、fail-closed 语义贯穿（未开启=false）。
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const storeDir = mkdtempSync(join(tmpdir(), 'ide-cua-rest-'))
process.env.IDE_CUA_POLICY_FILE = join(storeDir, 'ide-cua.json')

const { ideNativeRoutes } = await import('../../controllers/ide/native-routes')

interface Ctx {
  method: string
  path: string
  query: Record<string, string>
  body?: unknown
  status: number
  bodyJson: unknown
  headers: Record<string, string>
  set(k: string, v: string): void
}

function makeCtx(method: string, path: string, body?: unknown): Ctx {
  const url = new URL(path, 'http://x')
  return {
    method, path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body, status: 200, bodyJson: null, headers: {},
    set(k: string, v: string) { this.headers[k] = v },
  }
}

async function req(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const ctx = makeCtx(method, path, body)
  let nextCalled = false
  // koa request.body 挂在 ctx.request —— native-routes 读 ctx.request.body
  ;(ctx as any).request = { body }
  await (ideNativeRoutes() as any)(ctx, async () => { nextCalled = true })
  return { status: ctx.status, body: (ctx as any).body }
}

describe('Cua REST（native-routes）', () => {
  beforeEach(() => {
    writeFileSync(process.env.IDE_CUA_POLICY_FILE!, JSON.stringify({ version: 1, sessions: {} }))
  })

  it('status 返回 available 字段与说明；session get 默认 false（fail-closed）', async () => {
    const s = await req('GET', '/api/ide/cua/status')
    expect(s.status).toBe(200)
    expect(s.body.ok).toBe(true)
    expect(typeof s.body.available).toBe('boolean')
    expect(typeof s.body.note).toBe('string')
    const g = await req('GET', '/api/ide/cua/session/s1')
    expect(g.body).toMatchObject({ ok: true, sessionId: 's1', enabled: false })
  })

  it('PUT 开（broker 桩就绪）→凭据对落策略→env 注入 socket+authority；再关回落', async () => {
    const { setBrokerTransport } = await import('../../cua/policy')
    const { cuaBrokerHost } = await import('../../cua/broker')
    // 桩化 broker host：真拉起 broker 的行为由 broker 专测/E2E 覆盖
    ;(cuaBrokerHost() as unknown as { start: () => Promise<{ socket: string; authority: string }> }).start =
      async () => ({ socket: '/tmp/stub-cua.sock', authority: 'node-backend' })
    const put = await req('PUT', '/api/ide/cua/session/s1', { enabled: true })
    expect(put.body).toMatchObject({ ok: true, sessionId: 's1', enabled: true })
    const { cuaEnvForSession } = await import('../../cua/policy')
    expect(cuaEnvForSession('s1')).toEqual({
      ZCODE_CUA_PERMISSION_BROKER_SOCKET: '/tmp/stub-cua.sock',
      ZCODE_CUA_PLUGIN_AUTHORITY: 'node-backend',
    })
    const off = await req('PUT', '/api/ide/cua/session/s1', { enabled: false })
    expect(off.body.enabled).toBe(false)
    expect(cuaEnvForSession('s1')).toEqual({ ZCODE_CUA_DISABLE: '1' })
    setBrokerTransport(null)
  })

  it('PUT 参数校验：enabled 非布尔 → 400', async () => {
    const bad = await req('PUT', '/api/ide/cua/session/s1', { enabled: 'yes' })
    expect(bad.status).toBe(400)
    expect(bad.body.ok).toBe(false)
  })

  it('未匹配路径透传 next（既有端点不受影响）', async () => {
    const ctx = makeCtx('GET', '/api/ide/definitely-not-a-route')
    ;(ctx as any).request = { body: undefined }
    let passed = false
    await (ideNativeRoutes() as any)(ctx, async () => { passed = true })
    expect(passed).toBe(true)
  })
})
