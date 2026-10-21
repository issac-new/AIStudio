// P3-2 字段级脱敏 HTTP 守门（2026-10-21）：真 Koa 路由 + 角色中间件，
// 验证 GET /instances 对 viewer 脱敏、对 super_admin 放行；只读不改存储。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

let dir: string
let server: Server | null = null
let base = ''

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ontoredact-'))
  process.env.ONTOLOGY_DIR = dir
  const { ingestFiboDemo } = await import('../ontology-fibo-instances')
  expect(ingestFiboDemo(0).ok).toBe(true)

  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const { ontologyRoutes } = await import('../ontology-controller')
  const app = new Koa()
  app.use(async (ctx, next) => {
    const role = ctx.get('x-test-role')
    if (role) ctx.state.user = { role }
    await next()
  })
  app.use(ontologyRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((res) => server!.listen(0, '127.0.0.1', res))
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/hermes/ontology`
})

afterEach(async () => {
  delete process.env.ONTOLOGY_DIR
  if (server) await new Promise<void>((res) => server!.close(() => res()))
  rmSync(dir, { recursive: true, force: true })
})

async function get(path: string, role: string): Promise<any> {
  const res = await fetch(base + path, { headers: { 'x-test-role': role } })
  return res.json()
}

describe('GET /instances 字段级脱敏', () => {
  it('viewer：账户号与付款方标识变 ***，并返回脱敏计数', async () => {
    const acc = await get('/instances?type=Account', 'viewer')
    expect(acc.redacted).toBe(1)
    expect(acc.instances[0].data.accountNumber).toBe('***')
    expect(acc.instances[0].data.openedOn).toBe('2026-01-01')

    const payer = await get('/instances?type=Payer', 'viewer')
    expect(payer.instances[0].data.partyRef).toBe('***')
    expect(payer.redactedFields).toContain('Payer.partyRef')
  })

  it('super_admin：原文可见，零脱敏', async () => {
    const acc = await get('/instances?type=Account', 'super_admin')
    expect(acc.redacted).toBe(0)
    expect(acc.instances[0].data.accountNumber).toBe('ACC-1')
    const payer = await get('/instances?type=Payer', 'super_admin')
    expect(payer.instances[0].data.partyRef).toBe('ACME')
  })

  it('无鉴权上下文（本地 dev）视为管理上下文', async () => {
    const acc = await get('/instances?type=Account', '')
    expect(acc.redacted).toBe(0)
    expect(acc.instances[0].data.accountNumber).toBe('ACC-1')
  })
})
