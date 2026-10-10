// 本体工作台控制器守门：真 koa 起 HTTP 投影——spec GET/PUT（422 数据契约）、
// instances CRUD（写入即校验 422 / 404 / 403 写闸）、validate 跑批、export 三格式、
// versions/rollback/seed。env 指向 tmpdir。
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
  dir = mkdtempSync(join(tmpdir(), 'ontoapi-'))
  process.env.ONTOLOGY_DIR = dir
  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const bodyparser = (await import('@koa/bodyparser')).default
  const { ontologyRoutes } = await import('../ontology-controller')
  const app = new Koa()
  app.use(bodyparser())
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

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any; text: string; type: string }> {
  const res = await fetch(base + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* 非 JSON（turtle） */ }
  return { status: res.status, json, text, type: res.headers.get('content-type') ?? '' }
}

const GOOD_TASK = { id: 't1', type: 'Task', label: '任务1', data: { title: '标题', status: 'todo' }, relations: [] }
const BAD_TASK = { id: 't2', type: 'Task', label: '任务2', data: { title: '标题', status: 'banana' }, relations: [] }

describe('GET /spec', () => {
  it('冷启动返回种子 + 统计 + 健康度', async () => {
    const r = await call('GET', '/spec')
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(r.json.stats.typeCount).toBeGreaterThan(10)
    expect(r.json.stats.instanceCount).toBe(2)  // 种子实例
    expect(r.json.spec.entityTypes[0].id).toBeTruthy()
    expect(typeof r.json.health.error).toBe('number')
  })
})

describe('PUT /spec（模式层数据契约）', () => {
  it('error 违规 422 拒写；合法保存 200 且版本+1', async () => {
    const seed = (await call('GET', '/spec')).json.spec
    const bad = { ...seed, namespace: 'broken' }
    const r1 = await call('PUT', '/spec', bad)
    expect(r1.status).toBe(422)
    expect(r1.json.detail).toContain('拒写')
    const r2 = await call('PUT', '/spec', seed)
    expect(r2.status).toBe(200)
    expect(r2.json.spec.version).toBe(seed.version + 1)
  })
})

describe('instances 写入即校验', () => {
  it('error 实例 422（detail 讲数据契约语义）；合法 200 带 warning', async () => {
    const r1 = await call('POST', '/instances', BAD_TASK)
    expect(r1.status).toBe(422)
    expect(r1.json.violations.some((v: any) => v.code === 'field:enum')).toBe(true)
    const r2 = await call('POST', '/instances', GOOD_TASK)
    expect(r2.status).toBe(200)
    const r3 = await call('GET', '/instances?type=Task')
    expect(r3.json.instances).toHaveLength(1)
  })

  it('PUT 替换须 id 一致；DELETE 后 404；无鉴权写面默认放行（本地 dev）', async () => {
    await call('POST', '/instances', GOOD_TASK)
    const r1 = await call('PUT', '/instances/t1', { ...GOOD_TASK, id: 'zzz' })
    expect(r1.status).toBe(400)
    const r2 = await call('PUT', '/instances/t1', { ...GOOD_TASK, label: '改' })
    expect(r2.status).toBe(200)
    const r3 = await call('DELETE', '/instances/t1')
    expect(r3.status).toBe(200)
    const r4 = await call('DELETE', '/instances/t1')
    expect(r4.status).toBe(404)
  })

  it('非 super_admin 写面 403', async () => {
    // koa state.user 注入：起一个带假 auth 中间的实例直接测 superAdminDenied 分支
    const { createServer } = await import('node:http')
    const Koa = (await import('koa')).default
    const bodyparser = (await import('@koa/bodyparser')).default
    const { default: compose } = await import('koa-compose')
    // 直接构造与控制器同闸语义的对照（不引私有函数）：state.user.role=viewer
    const app = new Koa()
    app.use(bodyparser())
    app.use(async (ctx, next) => { (ctx as any).state = { user: { role: 'viewer' } }; await next() })
    const { ontologyRoutes: routes2 } = await import('../ontology-controller')
    app.use(routes2.routes())
    const srv = createServer(app.callback())
    await new Promise<void>((res) => srv.listen(0, '127.0.0.1', res))
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/hermes/ontology`
    const res = await fetch(`${url}/spec`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namespace: 'https://x.y/z#', entityTypes: [], objectProperties: [], axioms: [] }) })
    expect(res.status).toBe(403)
    await new Promise<void>((r) => srv.close(() => r()))
    void compose
  })
})

describe('POST /validate', () => {
  it('临时校验不入库 + 全量跑批带 spec 自检', async () => {
    const r1 = await call('POST', '/validate', { instances: [BAD_TASK] })
    expect(r1.status).toBe(200)
    expect(r1.json.persisted).toBe(false)
    expect(r1.json.violations.length).toBeGreaterThan(0)
    const r2 = await call('GET', '/instances')
    expect(r2.json.total).toBe(2)  // 种子未被污染
    const r3 = await call('POST', '/validate', {})
    expect(r3.json.persisted).toBe(true)
    expect(r3.json.summary).toHaveProperty('error')
  })
})

describe('GET /export', () => {
  it('jsonld/shacl 走 ld+json；turtle 走 text/turtle；坏格式 400', async () => {
    const r1 = await call('GET', '/export?format=jsonld')
    expect(r1.status).toBe(200)
    expect(r1.type).toContain('ld+json')
    expect(r1.json['@graph'].length).toBeGreaterThan(5)
    const r2 = await call('GET', '/export?format=shacl')
    expect(r2.json['@graph'].some((n: any) => n['@type'] === 'sh:NodeShape')).toBe(true)
    const r3 = await call('GET', '/export?format=turtle')
    expect(r3.type).toContain('text/turtle')
    expect(r3.text).toContain('@prefix core:')
    const r4 = await call('GET', '/export?format=xml')
    expect(r4.status).toBe(400)
  })
})

describe('versions / rollback / seed', () => {
  it('保存两版后可回滚到首版快照；seed 重置可再跑', async () => {
    const seed = (await call('GET', '/spec')).json.spec
    await call('PUT', '/spec', seed)
    await call('PUT', '/spec', seed)
    const vs = (await call('GET', '/versions')).json.versions
    expect(vs.length).toBeGreaterThanOrEqual(1)
    const rb = await call('POST', '/rollback', { ts: vs[0].ts })
    expect(rb.status).toBe(200)
    expect(rb.json.restoredVersion).toBe(vs[0].version)
    const s = await call('POST', '/seed', {})
    expect(s.status).toBe(200)
    expect(s.json.instanceCount).toBe(2)
  })
})
