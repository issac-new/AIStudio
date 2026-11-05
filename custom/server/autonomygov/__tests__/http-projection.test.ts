// 组织治理批 HTTP 投影守门（2026-11-05）：三域路由挂载后的真实请求形状。
// 目的：证明路由确实挂在契约前缀上、响应走 lib/http 的 ok/fail 形状、写入被拒时是 409/422
// 而不是 200+ok:false。这比 curl 探活强——它断言的是响应体，不只是状态码存在。
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import type { Context, Next } from 'koa'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { autonomyGovRoutes } from '../controller'
import { premiseLogRoutes } from '../../premiselog/controller'
import { metricPolicyRoutes } from '../../metricpolicy/controller'

let dir = ''
let server: ReturnType<typeof createServer> | null = null
let base = ''

/** 最小 JSON 体解析（不引第三方依赖：只需 application/json）。 */
async function jsonBody(ctx: Context, next: Next): Promise<void> {
  if (ctx.method === 'GET' || ctx.method === 'DELETE') { await next(); return }
  const chunks: Buffer[] = []
  for await (const chunk of ctx.req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  ;(ctx.request as { body?: unknown }).body = raw ? JSON.parse(raw) : {}
  await next()
}

async function start(): Promise<void> {
  const app = new Koa()
  app.use(jsonBody)
  app.use(autonomyGovRoutes.routes())
  app.use(premiseLogRoutes.routes())
  app.use(metricPolicyRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => (server as ReturnType<typeof createServer>).listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  base = `http://127.0.0.1:${port}`
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'orggov-http-'))
  process.env.HERMES_AUTONOMY_GOV_DIR = join(dir, 'autonomygov')
  process.env.HERMES_PREMISE_LOG_DIR = join(dir, 'premiselog')
  process.env.HERMES_METRIC_POLICY_DIR = join(dir, 'metricpolicy')
  process.env.HERMES_HOME = join(dir, 'hermes')   // 隔离看板库：测试不读真机数据
  process.env.AGENT_IDENTITY_STORE = join(dir, 'identity')
  await start()
})

afterEach(() => {
  server?.close()
  server = null
  for (const k of ['HERMES_AUTONOMY_GOV_DIR', 'HERMES_PREMISE_LOG_DIR', 'HERMES_METRIC_POLICY_DIR', 'HERMES_HOME', 'AGENT_IDENTITY_STORE']) {
    delete process.env[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

const DOD = {
  criteria: ['产物可直接进构建'],
  sample: '2026-10-31 卡片 #a1 的交付形态',
  stopCondition: '连续两次采纳率低于 60% 即停用',
}

describe('autonomygov 路由', () => {
  it('GET /scale 空台账返回 ok:true + 空数组', async () => {
    const r = await fetch(`${base}/api/autonomygov/scale`)
    expect(r.status).toBe(200)
    const b = await r.json() as { ok: boolean; entries: unknown[] }
    expect(b.ok).toBe(true)
    expect(b.entries).toEqual([])
  })

  it('PUT 合法配置 200 并回带 assessment；GET 读回可见', async () => {
    const put = await fetch(`${base}/api/autonomygov/scale/worker-coder`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ al: 2, dod: DOD, auditSampling: 0.1, humanScan: true }),
    })
    expect(put.status).toBe(200)
    const pb = await put.json() as { ok: boolean; assessment: { verdict: string; tier: string } }
    expect(pb.ok).toBe(true)
    expect(pb.assessment.verdict).toBe('ok')
    expect(pb.assessment.tier).toBe('collab')

    const list = await fetch(`${base}/api/autonomygov/scale`)
    const lb = await list.json() as { entries: { target: string }[] }
    expect(lb.entries.map((e) => e.target)).toEqual(['worker-coder'])
  })

  it('缺停止条件 → 400 + code=invalid-input（入参校验先于语义判定，不落盘）', async () => {
    const r = await fetch(`${base}/api/autonomygov/scale/bad`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ al: 3, dod: { ...DOD, stopCondition: '' }, auditSampling: 0.1, humanScan: true }),
    })
    expect(r.status).toBe(400)
    const b = await r.json() as { ok: boolean; code: string; problems: string[] }
    expect(b.ok).toBe(false)
    expect(b.code).toBe('invalid-input')
    expect(b.problems.join()).toContain('停止判据')
    // 读回：被拒的配置不得出现在台账里
    const list = await fetch(`${base}/api/autonomygov/scale`)
    expect(((await list.json()) as { entries: unknown[] }).entries).toEqual([])
  })

  it('AL5 缺抽样与扫描 → 409（条件式成立，非硬禁）', async () => {
    const r = await fetch(`${base}/api/autonomygov/scale/al5`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ al: 5, dod: DOD, auditSampling: 0, humanScan: false }),
    })
    expect(r.status).toBe(409)
    const b = await r.json() as { problems: string[] }
    expect(b.problems.join()).toContain('AL5 不成立')
  })

  it('GET /distribution 无配置时报 no-data', async () => {
    const r = await fetch(`${base}/api/autonomygov/distribution`)
    const b = await r.json() as { report: { total: number; checks: { id: string }[] } }
    expect(b.report.total).toBe(0)
    expect(b.report.checks[0].id).toBe('no-data')
  })

  it('POST /dual-sign/check 单签不满足并落缺口；GET /gaps 可见', async () => {
    const r = await fetch(`${base}/api/autonomygov/dual-sign/check`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeId: 'cr-1', klass: 'production-release', signatures: [{ by: 'alice', at: 1 }] }),
    })
    const b = await r.json() as { result: { satisfied: boolean; required: boolean } }
    expect(b.result.required).toBe(true)
    expect(b.result.satisfied).toBe(false)
    const gaps = await fetch(`${base}/api/autonomygov/gaps`)
    const gb = await gaps.json() as { dualSign: { recentGaps: unknown[] } }
    expect(gb.dualSign.recentGaps.length).toBe(1)
  })

  it('GET /roster-gaps 与 /decision-stage-ratios 均 200 且带 available 语义', async () => {
    const r1 = await fetch(`${base}/api/autonomygov/roster-gaps`)
    expect(r1.status).toBe(200)
    const b1 = await r1.json() as { total: number; blocked: number }
    expect(typeof b1.total).toBe('number')
    const r2 = await fetch(`${base}/api/autonomygov/decision-stage-ratios?limit=5`)
    expect(r2.status).toBe(200)
    const b2 = await r2.json() as { ratios: { available: boolean } }
    expect(b2.ratios.available).toBe(false)   // 空图谱：不假装有数据
  })
})

describe('premiselog 路由', () => {
  it('POST 合法假设 201 + Location；GET 读回', async () => {
    const r = await fetch(`${base}/api/premiselog/premises`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement: '客户续费率在 2027 年 Q1 低于 80%',
        kind: 'market',
        scope: ['2026-11-05-org-governance-autonomy-scale.md'],
        reviewAt: Date.now() + 86400000,
      }),
    })
    expect(r.status).toBe(201)
    expect(r.headers.get('location')).toMatch(/^\/api\/premiselog\/premises\/pr-/)
    const b = await r.json() as { entry: { id: string } }
    const list = await fetch(`${base}/api/premiselog/premises`)
    const lb = await list.json() as { entries: { id: string }[]; kinds: unknown[] }
    expect(lb.entries[0].id).toBe(b.entry.id)
    expect(lb.kinds.length).toBe(5)
  })

  it('口号式陈述 → 422（可证伪性形式校验）', async () => {
    const r = await fetch(`${base}/api/premiselog/premises`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: '我们要加强组织能力建设', kind: 'org', scope: ['x.md'], reviewAt: Date.now() }),
    })
    expect(r.status).toBe(422)
    const b = await r.json() as { code: string; problems: string[] }
    expect(b.code).toBe('invalid-premise')
    expect(b.problems.join()).toContain('口号')
  })

  it('影响面缺少仓根时如实报不可核验，不报失联', async () => {
    const created = await fetch(`${base}/api/premiselog/premises`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: 'A 渠道获客成本在 2027 年上涨超过 20%', kind: 'cost', scope: ['nope.md'], reviewAt: Date.now() }),
    })
    const { entry } = await created.json() as { entry: { id: string } }
    const r = await fetch(`${base}/api/premiselog/premises/${entry.id}/impact`)
    expect(r.status).toBe(200)
    const b = await r.json() as { report: { stale: number }; probe: { recognized: boolean } }
    // 测试 cwd 是仓根时会被识别；否则 recognized=false 且不产生 stale
    if (!b.probe.recognized) expect(b.report.stale).toBe(0)
  })

  it('推翻无证据 → 409；有证据 → 200 且生成重评项', async () => {
    const created = await fetch(`${base}/api/premiselog/premises`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: 'A 渠道获客成本在 2027 年上涨超过 20%', kind: 'cost', scope: ['x.md'], reviewAt: Date.now() }),
    })
    const { entry } = await created.json() as { entry: { id: string } }

    const bad = await fetch(`${base}/api/premiselog/premises/${entry.id}/refute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidence: '' }),
    })
    expect(bad.status).toBe(409)

    const good = await fetch(`${base}/api/premiselog/premises/${entry.id}/refute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence: '2026-11 复盘：实测 +23%' }),
    })
    expect(good.status).toBe(200)
    const gb = await good.json() as { reeval: { state: string } }
    expect(gb.reeval.state).toBe('queued')

    const queue = await fetch(`${base}/api/premiselog/reeval`)
    expect(((await queue.json()) as { items: unknown[] }).items.length).toBe(1)
  })

  it('重评项 dismissed 无理由 → 409', async () => {
    const created = await fetch(`${base}/api/premiselog/premises`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: 'A 渠道获客成本在 2027 年上涨超过 20%', kind: 'cost', scope: ['x.md'], reviewAt: Date.now() }),
    })
    const { entry } = await created.json() as { entry: { id: string } }
    await fetch(`${base}/api/premiselog/premises/${entry.id}/refute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence: '实测 +23%' }),
    })
    const queue = await fetch(`${base}/api/premiselog/reeval`)
    const { items } = await queue.json() as { items: { id: string }[] }
    const r = await fetch(`${base}/api/premiselog/reeval/${items[0].id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'dismissed', note: '' }),
    })
    expect(r.status).toBe(409)
  })
})

describe('metricpolicy 路由', () => {
  it('GET /metrics 返回六个内置指标', async () => {
    const r = await fetch(`${base}/api/metricpolicy/metrics`)
    expect(r.status).toBe(200)
    const b = await r.json() as { entries: { key: string }[] }
    expect(b.entries.length).toBe(6)
  })

  it('GET /audit 报装饰数=6（内置指标如实无消费者）', async () => {
    const r = await fetch(`${base}/api/metricpolicy/audit`)
    const b = await r.json() as { decorativeCount: number; errorCount: number; namespaces: { measure: number } }
    expect(b.decorativeCount).toBe(6)
    expect(b.errorCount).toBe(0)
    expect(b.namespaces.measure).toBe(6)
  })

  it('PUT 结算指标派生自测量指标 → 409 cross-track', async () => {
    // key 含 / 须编码（客户端 api 层同样用 encodeURIComponent）
    const r = await fetch(`${base}/api/metricpolicy/metrics/${encodeURIComponent('settle/payout-rate')}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace: 'settle', title: '分配率', definition: '实发 / 应发',
        sources: ['payroll'], derivedFrom: ['measure/autonomy-rate'],
      }),
    })
    expect(r.status).toBe(409)
    const b = await r.json() as { problems: string[] }
    expect(b.problems.join()).toContain('测量指标')
  })

  it('GET /core 在隔离看板下全部 available:false 且带 gap', async () => {
    const r = await fetch(`${base}/api/metricpolicy/core`)
    expect(r.status).toBe(200)
    const b = await r.json() as { readings: { key: string; available: boolean; gap?: string }[] }
    expect(b.readings.length).toBe(5)
    const human = b.readings.find((x) => x.key === 'measure/human-minutes-per-task')!
    expect(human.available).toBe(false)
    expect(human.gap).toBeTruthy()
  })

  it('GET /decorative 带判据句', async () => {
    const r = await fetch(`${base}/api/metricpolicy/decorative`)
    const b = await r.json() as { entries: { judgement: string }[] }
    expect(b.entries.length).toBe(6)
    expect(b.entries[0].judgement).toContain('哪个决策')
  })

  it('POST /key-check 前缀一致性自检', async () => {
    const r = await fetch(`${base}/api/metricpolicy/key-check`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'settle/x-rate', namespace: 'measure' }),
    })
    const b = await r.json() as { parsed: string; consistent: boolean }
    expect(b.parsed).toBe('settle')
    expect(b.consistent).toBe(false)
  })
})
