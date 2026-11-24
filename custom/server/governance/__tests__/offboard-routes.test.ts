// 离职路由登录态守门（2026-11-25 数字员工批一审查修复）：未登录调 /matrix-offboard
// 必须在任何离职副作用之前 401 返回——offboardAccount 不得被调用。
// 此前路由写 actor: decisionActor(ctx)?.username ?? ''：decisionActor 未登录时已写 401
// 并返回 null，但路由不 return，副作用（写工单并 git commit、停 Matrix 双账号、联动停用
// 自然人、审计留痕）全执行，随后 ctx.body 覆盖 401 响应体。
// 夹具：真 Koa + fetch（workunit-routes.test.ts 同形）；registry-admin 的 offboardAccount
// 以 vi.mock 换 spy——副作用是否发生以 spy 调用为准，不触真 Matrix/git。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../registry-admin', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../registry-admin')>()
  return { ...mod, offboardAccount: vi.fn(async () => ({ ok: true, deactivated: [] })) }
})

const dir = mkdtempSync(join(tmpdir(), 'offboard-http-'))
let base = ''
let server: ReturnType<typeof createServer>
let offboardSpy: ReturnType<typeof vi.fn>

/** 齐套入参：确保未登录用例走到的是身份闸而不是 400 入参校验。 */
const offboardBody = {
  localName: 'worker', handoverTo: 'alice', adminToken: 'tok', homeserverUrl: 'https://hs.example',
}

async function req(path: string, payload: unknown, as?: string): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (as) headers['x-test-actor'] = as
  const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(payload) })
  return { status: res.status, body: await res.json() }
}

beforeAll(async () => {
  process.env.AGENT_IDENTITY_STORE = dir
  // 先引控制器再引 registry-admin：二者循环互引（registry-admin 反向引控制器的 repoRoot），
  // 先引 registry-admin 会让控制器在 mock 注册前捕获真实绑定，spy 落空（实测 502 打到真网络）。
  const { governanceRoutes } = await import('../governance-controller')
  const registryAdmin = await import('../registry-admin')
  offboardSpy = vi.mocked(registryAdmin.offboardAccount) as unknown as ReturnType<typeof vi.fn>
  const app = new Koa()
  app.use(bodyParser())
  // 测试登录态中间件：x-test-actor 头置 ctx.state.user（requireAuthenticatedActor 的唯一信源）
  app.use(async (ctx, next) => {
    const as = ctx.get('x-test-actor')
    if (as) ctx.state.user = { id: as, username: as, role: 'super_admin' }
    await next()
  })
  app.use(governanceRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  rmSync(dir, { recursive: true, force: true })
  delete process.env.AGENT_IDENTITY_STORE
})

describe('matrix-offboard 登录态守门', () => {
  it('未登录 → 401 authenticated_actor_required，offboardAccount 未被调用', async () => {
    const r = await req('/api/governance/matrix-offboard', offboardBody)
    expect(r.status).toBe(401)
    expect(r.body.code).toBe('authenticated_actor_required')
    expect(offboardSpy).not.toHaveBeenCalled()
  })

  it('登录后离职人取服务端登录身份（actor=登录名，不回落空串）', async () => {
    const r = await req('/api/governance/matrix-offboard', offboardBody, 'alice')
    expect(r.status).toBe(200)
    expect(offboardSpy).toHaveBeenCalledTimes(1)
    expect(offboardSpy.mock.calls[0][0]).toMatchObject({ actor: 'alice', localName: 'worker' })
  })
})
