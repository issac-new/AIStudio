// 场景准入路由守门（B2，2026-11-28）：读取面三态、签署登录身份、冒填不生效、
// blocked 签 pilot 409、追加式留痕、节点新字段透传（B3）。fixture 全 tmp 隔离。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import bpaRoutes from '../bpa-controller'
import { readAdmissionRecords } from '../bpa-admission-store'
import { writeArchitecture } from '../bpa-store'
import type { BpaNode } from '../bpa-types'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bpa-admission-routes-'))
  process.env.BPA_STORE = join(dir, 'arch.json')
  process.env.BPA_ADMISSION_STORE = join(dir, 'admission.json')
  process.env.BPA_AUDIT_STORE = join(dir, 'audit.json')
  process.env.BPA_MATURITY_STORE = join(dir, 'maturity.json')
  // 自然人名单：p-1 张三 / p-2 李四 在岗，p-9 离岗
  mkdirSync(join(dir, 'people'))
  process.env.AGENT_IDENTITY_STORE = join(dir, 'people')
  writeFileSync(join(dir, 'people', 'people.json'), JSON.stringify({
    people: [
      { id: 'p-1', name: '张三', emails: [], active: true, source: 'seed', createdAt: 1 },
      { id: 'p-2', name: '李四', emails: [], active: true, source: 'seed', createdAt: 1 },
      { id: 'p-9', name: '旧人', emails: [], active: false, source: 'seed', createdAt: 1, deactivatedAt: 2, deactivatedBy: 'p-1', deactivatedReason: '离职' },
    ],
    nextSeq: 4,
  }))
  delete process.env.AISTUDIO_LOCAL_OPERATOR
})

afterEach(() => {
  for (const k of ['BPA_STORE', 'BPA_ADMISSION_STORE', 'BPA_AUDIT_STORE', 'BPA_MATURITY_STORE', 'AGENT_IDENTITY_STORE', 'AISTUDIO_LOCAL_OPERATOR']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

function node(partial: Partial<BpaNode> & { id: string; name: string; level: 1 | 2 | 3 }): BpaNode {
  return {
    parentId: null, updatedAt: 0,
    owner: 'p-1',
    kpis: [{ name: '一次通过率', target: '≥90%' }],
    dataCompliance: 'cleared',
    majorImpact: false,
    ...partial,
  } as BpaNode
}

function seedArch(): void {
  writeArchitecture([
    node({ id: 'L1-01', name: '运营', level: 1, parentId: null, section: 'OPERATING' }),
    node({ id: 'L2-01', name: '需求管理', level: 2, parentId: 'L1-01' }),
    node({ id: 'L3-01-01-01', name: '全清节点', level: 3, parentId: 'L2-01' }),
    node({ id: 'L3-02-01-01', name: '缺指标节点', level: 3, parentId: 'L2-01', kpis: [] }),
    node({ id: 'L3-03-01-01', name: '合规待核节点', level: 3, parentId: 'L2-01', dataCompliance: 'pending' }),
  ], { framework: 'OES+PCF6', mapSections: ['OPERATING'], maxDepth: 6, forbidSkippingLevel: true, requireEndToEnd: false, requireL3Owner: true, requireL3Kpi: true, reviewCycleDays: 180 })
}

async function listen(): Promise<{ port: number; close: () => void }> {
  const app = new Koa()
  app.use(bodyParser())
  // 测试身份中间件：x-test-actor 头 → ctx.state.user（workunit-routes 先例同款）
  app.use(async (ctx, next) => {
    const actor = ctx.get('x-test-actor')
    if (actor) ctx.state.user = { id: actor, username: actor, role: 'super_admin' }
    await next()
  })
  app.use(bpaRoutes.routes())
  const server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  return { port, close: () => server.close() }
}

async function req(port: number, method: string, path: string, payload?: unknown, as?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(as ? { 'x-test-actor': as } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('GET /api/bpa/admission（读取面）', () => {
  it('逐节点返回四条规则三态与推导结论；在岗名单可用', async () => {
    seedArch()
    const { port, close } = await listen()
    try {
      const { status, body } = await req(port, 'GET', '/api/bpa/admission')
      expect(status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.peopleAvailable).toBe(true)
      const nodes = body.nodes as Array<Record<string, unknown>>
      expect(nodes).toHaveLength(5)
      const byId = new Map(nodes.map((n) => [n.nodeId as string, n]))
      expect((byId.get('L3-01-01-01')!)).toMatchObject({ derived: 'eligible', pendingItems: [] })
      const noKpi = byId.get('L3-02-01-01')!
      expect(noKpi.derived).toBe('blocked')
      expect((noKpi.pendingItems as string[]).join()).toContain('未登记任何指标')
      const pending = byId.get('L3-03-01-01')!
      expect(pending.derived).toBe('blocked')
      expect((pending.rules as Array<{ rule: string; verdict: string }>).find((r) => r.rule === 'DATA_UNLAWFUL')?.verdict).toBe('hit')
    } finally { close() }
  })

  it('自然人名单读不到：peopleAvailable=false，主责规则如实无法判定而非命中', async () => {
    seedArch()
    // 损坏的名单文件才触发「读失败」；目录缺失是空名单（ENOENT 按空账），不伪装成读不到
    writeFileSync(join(dir, 'people', 'people.json'), '{ broken json')
    const { port, close } = await listen()
    try {
      const { body } = await req(port, 'GET', '/api/bpa/admission')
      expect(body.peopleAvailable).toBe(false)
      const first = (body.nodes as Array<Record<string, unknown>>)[0]
      const owner = (first.rules as Array<{ rule: string; verdict: string; detail: string }>).find((r) => r.rule === 'OWNER_MISSING')!
      expect(owner.verdict).toBe('undetermined')
      expect(owner.detail).toContain('读不到')
    } finally { close() }
  })
})

describe('POST /api/bpa/admission/:nodeId/sign（签署面）', () => {
  it('未登录 401', async () => {
    seedArch()
    const { port, close } = await listen()
    try {
      const { status, body } = await req(port, 'POST', '/api/bpa/admission/L3-01-01-01/sign', { conclusion: 'pilot', reason: '四条全清，试点价值高' })
      expect(status).toBe(401)
      expect((body as { code?: string }).code).toBe('authenticated_actor_required')
    } finally { close() }
  })

  it('登录签署 pilot：记录签署人=登录身份、快照四条、账本落盘；请求体冒填 signedBy 不生效', async () => {
    seedArch()
    const { port, close } = await listen()
    try {
      const { status, body } = await req(port, 'POST', '/api/bpa/admission/L3-01-01-01/sign',
        { conclusion: 'pilot', reason: '四条全清，试点价值高', signedBy: 'ghost' }, 'p-1')
      expect(status).toBe(200)
      const record = body.record as Record<string, unknown>
      expect(record.signedBy).toBe('p-1')
      expect(record.signedBy).not.toBe('ghost')
      expect((record.rulesSnapshot as unknown[])).toHaveLength(4)
      expect(record.pendingItems).toEqual([])
      expect(existsSync(process.env.BPA_ADMISSION_STORE!)).toBe(true)
    } finally { close() }
  })

  it('blocked 节点签 pilot → 409 admission_blocked，problems=待补清单', async () => {
    seedArch()
    const { port, close } = await listen()
    try {
      const { status, body } = await req(port, 'POST', '/api/bpa/admission/L3-02-01-01/sign',
        { conclusion: 'pilot', reason: '指标基线缺口我马上补齐后再申请试点' }, 'p-1')
      expect(status).toBe(409)
      expect((body as { code?: string }).code).toBe('admission_blocked')
      expect((body.problems as string[]).join()).toContain('未登记任何指标')
      // 拒签不落账
      expect(readAdmissionRecords()).toHaveLength(0)
    } finally { close() }
  })

  it('blocked 节点签 deferred → 放行，待补清单入账（暂缓是人的决定，不要求先补齐）', async () => {
    seedArch()
    const { port, close } = await listen()
    try {
      const { status, body } = await req(port, 'POST', '/api/bpa/admission/L3-02-01-01/sign',
        { conclusion: 'deferred', reason: '基线缺口短期补不上，先签署暂缓' }, 'p-2')
      expect(status).toBe(200)
      const record = body.record as Record<string, unknown>
      expect(record.conclusion).toBe('deferred')
      expect(record.signedBy).toBe('p-2')
      expect((record.pendingItems as string[]).join()).toContain('未登记任何指标')
    } finally { close() }
  })

  it('追加式：同节点两次签署留两条记录，GET 返回 latest=后签的', async () => {
    seedArch()
    const { port, close } = await listen()
    try {
      await req(port, 'POST', '/api/bpa/admission/L3-01-01-01/sign', { conclusion: 'deferred', reason: '先等预算批复到位，暂缓推进' }, 'p-1')
      await req(port, 'POST', '/api/bpa/admission/L3-01-01-01/sign', { conclusion: 'pilot', reason: '预算已批复到位，现在可以进入试点' }, 'p-2')
      expect(readAdmissionRecords()).toHaveLength(2)
      const { body } = await req(port, 'GET', '/api/bpa/admission')
      const first = (body.nodes as Array<Record<string, unknown>>).find((n) => n.nodeId === 'L3-01-01-01')!
      const latest = first.latest as Record<string, unknown>
      expect(latest.conclusion).toBe('pilot')
      expect(latest.signedBy).toBe('p-2')
    } finally { close() }
  })

  it('reason 过短 400；conclusion 非法 400；节点不存在 404', async () => {
    seedArch()
    const { port, close } = await listen()
    try {
      const short = await req(port, 'POST', '/api/bpa/admission/L3-01-01-01/sign', { conclusion: 'pilot', reason: '好的' }, 'p-1')
      expect(short.status).toBe(400)
      const bad = await req(port, 'POST', '/api/bpa/admission/L3-01-01-01/sign', { conclusion: 'maybe', reason: '理由写够十个字以上' }, 'p-1')
      expect(bad.status).toBe(400)
      const missing = await req(port, 'POST', '/api/bpa/admission/L3-99-99-99/sign', { conclusion: 'pilot', reason: '这里的理由写得足够长，能够通过长度校验' }, 'p-1')
      expect(missing.status).toBe(404)
      expect(readAdmissionRecords()).toHaveLength(0)
    } finally { close() }
  })

  it('登录身份不是在岗自然人也能签吗——不：签署人须为在岗自然人（与责任卡同纪律）', async () => {
    seedArch()
    const { port, close } = await listen()
    try {
      // p-9 在名单里但已离岗：签署应被拒
      const { status } = await req(port, 'POST', '/api/bpa/admission/L3-01-01-01/sign', { conclusion: 'pilot', reason: '四条全清，试点价值高' }, 'p-9')
      expect(status).toBe(400)
      // 完全不在名单的人同样拒
      const r2 = await req(port, 'POST', '/api/bpa/admission/L3-01-01-01/sign', { conclusion: 'pilot', reason: '四条全清，试点价值高' }, 'ghost')
      expect(r2.status).toBe(400)
      expect(readAdmissionRecords()).toHaveLength(0)
    } finally { close() }
  })
})

describe('B3 节点新字段透传', () => {
  it('PUT /node 带场景准入字段：落盘保留、GET /admission 按新字段判定', async () => {
    seedArch()
    const { port, close } = await listen()
    try {
      const put = await req(port, 'PUT', '/api/bpa/node', {
        node: node({
          id: 'L3-01-01-01', name: '全清节点', level: 3, parentId: 'L2-01',
          trigger: '客户提交需求后由值班人启动',
          dataSources: 'CRM 工单库，日级新鲜度',
          majorImpact: true, reviewer: 'p-2',
        }),
      }, 'p-1')
      expect(put.status).toBe(200)
      // 落盘保留（存档文件里能读出新字段）
      const raw = JSON.parse(readFileSync(process.env.BPA_STORE!, 'utf8')) as { nodes: BpaNode[] }
      const saved = raw.nodes.find((n) => n.id === 'L3-01-01-01')!
      expect(saved.trigger).toContain('值班人')
      expect(saved.majorImpact).toBe(true)
      // GET /admission 按新字段判定：重大影响有复核人 → 仍 eligible
      const { body } = await req(port, 'GET', '/api/bpa/admission')
      const first = (body.nodes as Array<Record<string, unknown>>).find((n) => n.nodeId === 'L3-01-01-01')!
      expect(first.derived).toBe('eligible')
    } finally { close() }
  })

  it('编辑改名不丢准入字段（探查警告的保存重建问题，服务端透传面验证）', async () => {
    seedArch()
    const { port, close } = await listen()
    try {
      // 先带字段写入
      await req(port, 'PUT', '/api/bpa/node', {
        node: node({ id: 'L3-01-01-01', name: '旧名', level: 3, parentId: 'L2-01', trigger: '触发条件A', dataCompliance: 'pending' }),
      }, 'p-1')
      // 再只改名重存（客户端 save() 只发它认识的字段时的最坏情况——服务端不替客户端补字段，
      // 但 upsert 是整体替换：字段来自请求体。这里验证「请求体带字段的改名」不丢）
      await req(port, 'PUT', '/api/bpa/node', {
        node: node({ id: 'L3-01-01-01', name: '新名', level: 3, parentId: 'L2-01', trigger: '触发条件A', dataCompliance: 'pending' }),
      }, 'p-1')
      const raw = JSON.parse(readFileSync(process.env.BPA_STORE!, 'utf8')) as { nodes: BpaNode[] }
      const saved = raw.nodes.find((n) => n.id === 'L3-01-01-01')!
      expect(saved.name).toBe('新名')
      expect(saved.trigger).toBe('触发条件A')
      expect(saved.dataCompliance).toBe('pending')
      // 合规待核 → admission 判 hit
      const { body } = await req(port, 'GET', '/api/bpa/admission')
      const first = (body.nodes as Array<Record<string, unknown>>).find((n) => n.nodeId === 'L3-01-01-01')!
      expect(first.derived).toBe('blocked')
    } finally { close() }
  })
})
