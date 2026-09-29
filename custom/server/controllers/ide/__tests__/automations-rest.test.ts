// A2 守门：/api/ide/automations REST（router-harness 模式=engine-models 同款；
// IDE_AUTOMATIONS_STORE 注入临时目录，不碰生产 runtime/。事件摄入只测不命中
// 路径——派发链在 engine 级测试已覆盖，此处不碰 mention 总线单例）。
import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Router from '@koa/router'

const dir = mkdtempSync(join(tmpdir(), 'ide-automations-'))
process.env.IDE_AUTOMATIONS_STORE = dir

interface CtxShape {
  params?: Record<string, string>
  request: { body: Record<string, unknown> }
  status: number
  body: unknown
}

async function run(router: Router, method: 'get' | 'post' | 'patch' | 'delete', path: string, ctx: Partial<CtxShape>): Promise<CtxShape> {
  const full: CtxShape = { request: { body: {} }, status: 200, body: undefined, ...ctx } as CtxShape
  const layer = router.stack.find((l) => l.methods.includes(method.toUpperCase()) && l.match(path))
  expect(layer, `route ${method} ${path} exists`).toBeTruthy()
  for (const mw of (layer as unknown as { stack: Array<(c: CtxShape, next?: () => Promise<void>) => Promise<void>> }).stack) {
    await mw(full, async () => {})
  }
  return full
}

describe('/api/ide/automations（A2 REST）', () => {
  let router: Router
  beforeAll(async () => {
    const mod = await import('../automations')
    router = mod.default as unknown as Router
  })

  it('GET 空态；POST 合法规则 201 落档；非法 400 字段点名', async () => {
    const empty = await run(router, 'get', '/api/ide/automations', {})
    expect(empty.status).toBe(200)
    expect((empty.body as { rules: unknown[] }).rules).toEqual([])

    const bad = await run(router, 'post', '/api/ide/automations/rules', {
      request: { body: { name: '', workspacePath: 'rel', source: { type: 'x' }, promptTemplate: '' } },
    })
    expect(bad.status).toBe(400)
    expect(Object.keys((bad.body as { errors: Record<string, string> }).errors).length).toBeGreaterThan(3)

    const ok = await run(router, 'post', '/api/ide/automations/rules', {
      request: { body: { name: '新接口补测试', workspacePath: '/ws/p', source: { type: 'file', pathPattern: 'src/api/**.ts' }, promptTemplate: '补测试 {{paths}}' } },
    })
    expect(ok.status).toBe(201)
    expect(existsSync(join(dir, 'ide-automations.json'))).toBe(true)
    const rule = (ok.body as { rule: { id: string; enabled: boolean; debounceMs: number } }).rule
    expect(rule.enabled).toBe(true)
    expect(rule.debounceMs).toBe(2000)

    // PATCH 启停 + 未知 404
    const patched = await run(router, 'patch', '/api/ide/automations/rules/x1', {
      params: { id: rule.id }, request: { body: { enabled: false } },
    })
    expect(patched.status).toBe(200)
    expect((patched.body as { rule: { enabled: boolean } }).rule.enabled).toBe(false)
    const missing = await run(router, 'patch', '/api/ide/automations/rules/nope', {
      params: { id: 'nope' }, request: { body: { enabled: true } },
    })
    expect(missing.status).toBe(404)

    // DELETE 未知 404
    const del404 = await run(router, 'delete', '/api/ide/automations/rules/nope', { params: { id: 'nope' } })
    expect(del404.status).toBe(404)
    const del = await run(router, 'delete', '/api/ide/automations/rules/x2', { params: { id: rule.id } })
    expect(del.status).toBe(200)
  })

  it('POST events：结构校验 400；合法但不命中 → matched 0（不触发派发）', async () => {
    const bad = await run(router, 'post', '/api/ide/automations/events', {
      request: { body: { type: 'weird', workspacePath: 'rel' } },
    })
    expect(bad.status).toBe(400)

    const ok = await run(router, 'post', '/api/ide/automations/events', {
      request: { body: { type: 'webhook', workspacePath: '/nowhere', source: 'ci', eventType: 'push' } },
    })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ ok: true, matched: 0, scheduled: 0 })
  })
})
