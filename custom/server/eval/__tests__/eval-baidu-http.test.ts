// 百度评测范式轮 HTTP 投影守门：指标注册表 / 红队 / 评估器审计 / 证据端点。
// 真 koa + fetch，store 全 tmpdir 隔离（不触真 home）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let server: import('node:http').Server
let port: number

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'eval-baidu-http-'))
  process.env.EVAL_STORE = join(dir, 'eval')
  process.env.REDTEAM_STORE = join(dir, 'redteam')
  process.env.HELDOUT_STORE = join(dir, 'heldout')
  process.env.HERMES_TRACES_DIR = join(dir, 'no-traces')
  process.env.EVAL_TRACE_DIR = join(dir, 'no-traces')

  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const { evalRoutes } = await import('../controller')
  const app = new Koa()
  app.use(async (ctx: any, next: () => Promise<unknown>) => {
    if (ctx.method === 'POST' || ctx.method === 'PUT' || ctx.method === 'PATCH') {
      const chunks: Buffer[] = []
      for await (const chunk of ctx.req) chunks.push(Buffer.from(chunk))
      const raw = Buffer.concat(chunks).toString('utf8')
      ctx.request.body = raw ? JSON.parse(raw) : {}
    }
    await next()
  })
  app.use(evalRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
})

afterEach(() => {
  server.close()
  for (const k of ['EVAL_STORE', 'REDTEAM_STORE', 'HELDOUT_STORE', 'HERMES_TRACES_DIR', 'EVAL_TRACE_DIR']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

const get = async (path: string): Promise<{ status: number; body: any }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: res.status, body: await res.json() }
}

const post = async (path: string, body: unknown): Promise<{ status: number; body: any }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const taskWith = (dimension?: string) => ({
  id: 't1',
  problem: 'p',
  expectedBehavior: 'e',
  ...(dimension ? { dimension } : {}),
  rubric: [{ id: 'a1', text: 'a1', expect: 'yes', kind: 'result' }],
})

async function createSet(name: string, dimension?: string): Promise<string> {
  const res = await post('/api/hermes/eval/sets', { name, track: 'e2e', tasks: [taskWith(dimension)] })
  expect(res.status).toBe(201)
  return res.body.set.id
}

describe('指标注册表 HTTP', () => {
  it('GET /metric-registry：200 + 指标/动作/消费/覆盖七维', async () => {
    const { status, body } = await get('/api/hermes/eval/metric-registry')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.registry.metrics.length).toBeGreaterThan(10)
    expect(body.registry.actions.map((a: any) => a.key)).toContain('gate_block')
    expect(body.registry.boundary).toContain('评测域')
    expect(body.coverage.total).toBe(7)
  })
})

describe('红队 HTTP', () => {
  it('GET corpus：检测器 S1 未接线如实声明，算子 12 个', async () => {
    const { status, body } = await get('/api/hermes/eval/redteam/corpus')
    expect(status).toBe(200)
    expect(body.detector.id).toBe('s0-rules')
    expect(body.detector.s1Wired).toBe(false)
    expect(body.operators).toHaveLength(12)
    expect(body.categories.length).toBe(8)
    expect(body.benignCount).toBeGreaterThanOrEqual(4)
  })

  it('POST run → 201；列表与详情可查', async () => {
    const created = await post('/api/hermes/eval/redteam/runs', { generations: 1, population: 4, threshold: 3, seed: 7 })
    expect(created.status).toBe(201)
    expect(created.body.run.totals.evaluated).toBeGreaterThan(0)
    expect(created.body.run.s1Wired).toBe(false)
    const id = created.body.run.id
    const list = await get('/api/hermes/eval/redteam/runs?limit=5')
    expect(list.status).toBe(200)
    expect(list.body.runs[0].id).toBe(id)
    const detail = await get(`/api/hermes/eval/redteam/runs/${encodeURIComponent(id)}`)
    expect(detail.status).toBe(200)
    expect(detail.body.run.byCategory.length).toBe(8)
  })

  it('参数越界 400 且带问题清单', async () => {
    const res = await post('/api/hermes/eval/redteam/runs', { generations: 99 })
    expect(res.status).toBe(400)
    expect(res.body.problems.join()).toContain('generations')
  })
})

describe('评估器审计与证据 HTTP', () => {
  it('维度假集建集成功；运行不存在 404', async () => {
    const setId = await createSet('dims', 'task_completion')
    expect(setId).toMatch(/^eset-/)
    const { status } = await get('/api/hermes/eval/runs/no-such-run/evaluators')
    expect(status).toBe(404)
  })

  it('证据端点：无 trace 如实说明；密封集 403', async () => {
    const { appendRun } = await import('../store')
    const openId = await createSet('open-set')
    appendRun({
      id: 'erun-open', setId: openId, target: {}, k: 2, status: 'done', createdAt: 1,
      attempts: [{ taskId: 't1', sampleIdx: 1, sessionId: 'missing-session', verdicts: [{ assertionId: 'a1', value: 'yes', source: 's0', reason: 'S0 regex 命中' }] }],
      aggregates: {} as never,
    })
    const open = await get('/api/hermes/eval/runs/erun-open/evidence?taskId=t1&sampleIdx=1')
    expect(open.status).toBe(200)
    expect(open.body.ok).toBe(false)
    expect(open.body.reason).toBe('trace 不存在')

    const sealedId = await createSet('sealed-set')
    await post(`/api/hermes/eval/sets/${encodeURIComponent(sealedId)}/seal`, {})
    appendRun({
      id: 'erun-sealed', setId: sealedId, target: {}, k: 2, status: 'done', createdAt: 2,
      attempts: [{ taskId: 't1', sampleIdx: 1, sessionId: 'missing-session', verdicts: [{ assertionId: 'a1', value: 'yes', source: 's0' }] }],
      aggregates: {} as never,
    })
    const sealed = await get('/api/hermes/eval/runs/erun-sealed/evidence?taskId=t1&sampleIdx=1')
    expect(sealed.status).toBe(403)
  })

  it('评估器审计：来源计数与严格/保守口径', async () => {
    const { appendRun } = await import('../store')
    const setId = await createSet('audit-set')
    appendRun({
      id: 'erun-audit', setId, target: {}, k: 2, status: 'done', createdAt: 3,
      attempts: [{
        taskId: 't1', sampleIdx: 1,
        verdicts: [{ assertionId: 'a1', value: 'unknown', source: 's1', reason: 'S1 unknown p=0.50' }],
        judgeMeta: { backend: 'mock', latencyMs: 1, cached: false, online: true },
      }],
      aggregates: {} as never,
    })
    const { status, body } = await get('/api/hermes/eval/runs/erun-audit/evaluators')
    expect(status).toBe(200)
    expect(body.audit.bySource.s1).toBe(1)
    expect(body.audit.policy.strict.passAt1).toBe(0)
    expect(body.audit.policy.conservative.passAt1).toBe(1)
    expect(body.audit.audit.ratio).toBe(1)
  })
})
