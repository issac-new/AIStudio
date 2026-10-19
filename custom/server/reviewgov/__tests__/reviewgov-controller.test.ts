// 评审治理 REST 守门：开案例→发现→验证→回答→审批→检查→合并→信号→度量。
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { createServer, type Server } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { reviewGovRoutes } from '../reviewgov-controller'

type Handler = (ctx: Record<string, unknown>) => Promise<void>

function handlerFor(method: string, path: string): Handler {
  const layers = (reviewGovRoutes as unknown as {
    stack: Array<{ path: string; methods: string[]; stack: Array<(...a: unknown[]) => unknown> }>
  }).stack
  const layer = layers.find((l) => l.path === path && l.methods.includes(method))
    ?? layers.find((l) => l.path.endsWith(path) && l.methods.includes(method))
  if (!layer) throw new Error(`route not found: ${method} ${path}; have ${layers.map((l) => `${l.methods.join(',')} ${l.path}`).join(' | ')}`)
  return layer.stack[layer.stack.length - 1] as Handler
}

function fakeCtx(
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
  query: Record<string, unknown> = {},
  state: Record<string, unknown> = {},
) {
  return { params, request: { body }, query, state, status: 200, body: undefined as unknown }
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-gov-'))
  process.env.HERMES_REVIEW_GOV_DIR = dir
  delete process.env.HERMES_REVIEW_POLICY_FILE
})
afterEach(() => {
  delete process.env.HERMES_REVIEW_GOV_DIR
  delete process.env.HERMES_REVIEW_POLICY_FILE
  rmSync(dir, { recursive: true, force: true })
})

const openCase = () => handlerFor('POST', '/gov/cases')
const addFinding = () => handlerFor('POST', '/gov/cases/:id/findings')
const verify = () => handlerFor('POST', '/gov/cases/:id/findings/:fid/verify')
const answer = () => handlerFor('POST', '/gov/cases/:id/findings/:fid/answer')
const approve = () => handlerFor('POST', '/gov/cases/:id/approvals')
const checks = () => handlerFor('POST', '/gov/cases/:id/checks')
const state = () => handlerFor('POST', '/gov/cases/:id/state')
const signal = () => handlerFor('POST', '/gov/signals')
const metrics = () => handlerFor('GET', '/gov/metrics')
const policy = () => handlerFor('GET', '/gov/policy')
const rounds = () => handlerFor('POST', '/gov/cases/:id/rounds')

describe('评审治理 REST 全链路', () => {
  it('高风险案例需要 2 名人类；Agent 审批不占名额；全绿后才可合并', async () => {
    const created = fakeCtx({}, {
      caseId: 'case-1',
      title: '改 CI',
      headCommit: 'c1',
      changedPaths: ['.github/workflows/ci.yml'],
    })
    await openCase()(created)
    expect(created.status).toBe(200)
    const c = created.body as { case: { risk: { tier: string; requiredHumanApprovals: number } } }
    expect(c.case.risk.tier).toBe('high')
    expect(c.case.risk.requiredHumanApprovals).toBe(2)

    // important 无证据 → 400
    const noEvidence = fakeCtx({ id: 'case-1' }, {
      file: 'packages/server/src/x.ts', line: 3, body: '越界', severity: 'important',
    })
    await addFinding()(noEvidence)
    expect(noEvidence.status).toBe(400)

    // 有证据 → 入库；验证确认 → 阻塞
    const added = fakeCtx({ id: 'case-1' }, {
      file: 'packages/server/src/x.ts', line: 3, body: '越界', severity: 'important', evidence: 'npm test: FAIL',
    })
    await addFinding()(added)
    expect(added.status).toBe(200)
    const fid = (added.body as { finding: { findingId: string } }).finding.findingId

    const verified = fakeCtx({ id: 'case-1', fid }, { vote: 'confirm', voter: 'verifier-1', actorKind: 'agent' })
    await verify()(verified)
    expect(verified.status).toBe(200)
    expect((verified.body as { readiness: { ready: boolean } }).readiness.ready).toBe(false)

    // 回答 fixed → 解除阻塞
    const answered = fakeCtx({ id: 'case-1', fid }, { resolution: 'fixed' })
    await answer()(answered)
    expect(answered.status).toBe(200)

    // Agent 审批：记录但不占名额
    const agentApprove = fakeCtx({ id: 'case-1' }, {
      actor: 'review-agent', actorKind: 'agent', decision: 'approve', commit: 'c1',
    })
    await approve()(agentApprove)
    expect((agentApprove.body as { readiness: { humanApprovals: number; agentApprovals: number } }).readiness)
      .toMatchObject({ humanApprovals: 0, agentApprovals: 1 })

    // 两名人类审批
    for (const actor of ['alice', 'bob']) {
      const ok = fakeCtx({ id: 'case-1' }, { actor, actorKind: 'human', decision: 'approve', commit: 'c1' })
      await approve()(ok)
      expect(ok.status).toBe(200)
    }

    // 检查绿 → 就绪
    const green = fakeCtx({ id: 'case-1' }, { checks: 'green' })
    await checks()(green)
    expect((green.body as { readiness: { ready: boolean } }).readiness.ready).toBe(true)

    // 合并 → 写 merge 信号
    const merged = fakeCtx({ id: 'case-1' }, { state: 'merged' })
    await state()(merged)
    expect(merged.status).toBe(200)
    expect((merged.body as { case: { state: string } }).case.state).toBe('merged')

    // 度量
    const m = fakeCtx()
    await metrics()(m)
    expect(m.status).toBe(200)
    expect((m.body as { metrics: { cases: number; merged: number } }).metrics).toMatchObject({ cases: 1, merged: 1 })
  })

  it('回滚信号触发熔断，策略接口如实返回', async () => {
    const created = fakeCtx({}, {
      caseId: 'case-2', title: 'x', headCommit: 'c1', changedPaths: ['packages/server/src/x.ts'],
    })
    await openCase()(created)
    const merged = fakeCtx({ id: 'case-2' }, { state: 'abandoned' })
    await state()(merged)

    const revert = fakeCtx({}, { kind: 'revert', note: '线上回滚' })
    await signal()(revert)
    expect(revert.status).toBe(200)
    const breaker = (revert.body as { breaker: { active: boolean } }).breaker
    expect(breaker.active).toBe(false)   // 没有 merge 样本，回滚率不可算；事故数为 0

    const incident = fakeCtx({}, { kind: 'incident', note: '事故 1' })
    await signal()(incident)
    const incident2 = fakeCtx({}, { kind: 'incident', note: '事故 2' })
    await signal()(incident2)
    const p = fakeCtx()
    await policy()(p)
    expect((p.body as { breaker: { active: boolean } }).breaker.active).toBe(true)
  })

  it('轮次封顶返回 409；无提交的审批返回 400', async () => {
    const created = fakeCtx({}, {
      caseId: 'case-3', title: 'x', changedPaths: ['packages/server/src/x.ts'],
    })
    await openCase()(created)

    const noCommit = fakeCtx({ id: 'case-3' }, { actor: 'alice', decision: 'approve' })
    await approve()(noCommit)
    expect(noCommit.status).toBe(400)
    expect((noCommit.body as { code: string }).code).toBe('commit_required')

    for (const head of ['c2', 'c3']) {
      const r = fakeCtx({ id: 'case-3' }, { headCommit: head })
      await rounds()(r)
      expect(r.status).toBe(200)
    }
    const capped = fakeCtx({ id: 'case-3' }, { headCommit: 'c4' })
    await rounds()(capped)
    expect(capped.status).toBe(409)
    expect((capped.body as { code: string }).code).toBe('round_cap_reached')
  })

  it('列表接口按 state/tier 过滤；未知案例 404', async () => {
    const created = fakeCtx({}, {
      caseId: 'case-4', title: 'x', headCommit: 'c1', changedPaths: ['docs/a.md'],
    })
    await openCase()(created)
    const list = handlerFor('GET', '/gov/cases')
    const all = fakeCtx({}, {}, {})
    await list(all)
    expect((all.body as { cases: unknown[] }).cases).toHaveLength(1)
    const low = fakeCtx({}, {}, { tier: 'low' })
    await list(low)
    expect((low.body as { cases: unknown[] }).cases).toHaveLength(1)
    const high = fakeCtx({}, {}, { tier: 'high' })
    await list(high)
    expect((high.body as { cases: unknown[] }).cases).toHaveLength(0)

    const detail = handlerFor('GET', '/gov/cases/:id')
    const missing = fakeCtx({ id: 'nope' })
    await detail(missing)
    expect(missing.status).toBe(404)
  })
})

describe('父路由挂载（/api/review/gov/*）', () => {
  let server: Server | null = null
  let base = ''

  beforeAll(async () => {
    const { reviewRoutes } = await import('../../review/review-controller')
    const app = new Koa()
    app.use(bodyParser())
    app.use(reviewRoutes.routes())
    server = createServer(app.callback())
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => { server?.close() })

  it('子路由前缀与父前缀正确组合，策略与案例端点可达', async () => {
    const p = await fetch(`${base}/api/review/gov/policy`)
    expect(p.status).toBe(200)
    const pb = await p.json() as { ok: boolean; policy: { convergence: { maxRounds: number } } }
    expect(pb.ok).toBe(true)
    expect(pb.policy.convergence.maxRounds).toBe(3)

    const created = await fetch(`${base}/api/review/gov/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: 'http-case', title: 'HTTP 案例', headCommit: 'c1', changedPaths: ['docs/a.md'] }),
    })
    expect(created.status).toBe(200)
    const detail = await fetch(`${base}/api/review/gov/cases/http-case`)
    expect(detail.status).toBe(200)
    const db = await detail.json() as { case: { caseId: string; risk: { tier: string } } }
    expect(db.case).toMatchObject({ caseId: 'http-case', risk: { tier: 'low' } })
  })
})

describe('P2 扩展端点（PR 导入/夜间扫描/评测打分/回滚/熔断收紧）', () => {
  const fromPr = () => handlerFor('POST', '/gov/cases/from-pr')
  const nightlyRun = () => handlerFor('POST', '/gov/nightly/run')
  const evalRun = () => handlerFor('POST', '/gov/eval/run')
  const rollback = () => handlerFor('POST', '/gov/cases/:id/rollback')

  it('PR 导入：归一化载荷、风险分级、同 repo+number 幂等', async () => {
    const body = {
      provider: 'github', repo: 'acme/repo', number: 12, title: '修复缓存',
      headCommit: 'abc', changedPaths: ['docs/readme.md'], url: 'https://github.com/acme/repo/pull/12',
    }
    const first = fakeCtx({}, body)
    await fromPr()(first)
    expect(first.status).toBe(200)
    const b1 = first.body as { created: boolean; case: { caseId: string; pr: { number: number }; risk: { tier: string } } }
    expect(b1.created).toBe(true)
    expect(b1.case.pr.number).toBe(12)
    expect(b1.case.risk.tier).toBe('low')

    const second = fakeCtx({}, body)
    await fromPr()(second)
    expect(second.status).toBe(200)
    expect((second.body as { created: boolean }).created).toBe(false)
  })

  it('夜间扫描：第 3 轮转入的存量问题进报告', async () => {
    const created = fakeCtx({}, {
      caseId: 'nightly-case', title: 'x', headCommit: 'c1', changedPaths: ['packages/server/src/x.ts'],
    })
    await openCase()(created)
    for (const head of ['c2', 'c3']) {
      const r = fakeCtx({ id: 'nightly-case' }, { headCommit: head })
      await rounds()(r)
    }
    const stale = fakeCtx({ id: 'nightly-case' }, {
      file: 'packages/server/src/old.ts', line: 1, body: '历史遗留', severity: 'preexisting',
    })
    await addFinding()(stale)
    expect((stale.body as { finding: { deferred: boolean } }).finding.deferred).toBe(true)

    const run = fakeCtx({})
    await nightlyRun()(run)
    expect(run.status).toBe(200)
    const report = (run.body as { report: { backlog: number; groups: Array<{ file: string; count: number }> } }).report
    expect(report.backlog).toBe(1)
    expect(report.groups[0].file).toBe('packages/server/src/old.ts')
  })

  it('评测打分：命中/漏网/误报与运行台账', async () => {
    const { appendEvalCase } = await import('../store')
    appendEvalCase({ caseId: 'seed', source: 'manual', title: 'x', expected: 'y', file: 'a.ts', line: 10 })
    const run = fakeCtx({}, { predictions: [{ file: 'a.ts', line: 11 }, { file: 'b.ts', line: 1 }] })
    await evalRun()(run)
    expect(run.status).toBe(200)
    const b = run.body as { run: { total: number; matched: number; recall: number; precision: number; falsePositives: unknown[] } }
    expect(b.run).toMatchObject({ total: 1, matched: 1, recall: 1, precision: 0.5 })
    expect(b.run.falsePositives).toHaveLength(1)

    const bad = fakeCtx({}, { predictions: [{ file: '/etc/passwd' }] })
    await evalRun()(bad)
    expect(bad.status).toBe(400)
  })

  it('回滚登记：转 abandoned、写回滚字段与 revert 信号，重复调用不重复记账', async () => {
    const { listSignals } = await import('../store')
    const created = fakeCtx({}, { caseId: 'rb-case', title: 'x', headCommit: 'c1', changedPaths: ['packages/server/src/x.ts'] })
    await openCase()(created)
    const first = fakeCtx({ id: 'rb-case' }, { note: '线上回滚' })
    await rollback()(first)
    expect(first.status).toBe(200)
    const b = first.body as { case: { state: string; rollback: { note: string } } }
    expect(b.case.state).toBe('abandoned')
    expect(b.case.rollback.note).toBe('线上回滚')
    const reverts = listSignals().filter((s) => s.kind === 'revert').length
    expect(reverts).toBe(1)

    const second = fakeCtx({ id: 'rb-case' }, {})
    await rollback()(second)
    expect(listSignals().filter((s) => s.kind === 'revert').length).toBe(1)
  })

  it('熔断信号收紧存量案例：升档并作废旧审批', async () => {
    const { loadCase } = await import('../store')
    const created = fakeCtx({}, { caseId: 'tight-case', title: 'x', headCommit: 'c1', changedPaths: ['packages/server/src/x.ts'] })
    await openCase()(created)
    const approveCtx = fakeCtx({ id: 'tight-case' }, { actor: 'alice', actorKind: 'human', decision: 'approve', commit: 'c1' })
    await approve()(approveCtx)
    const green = fakeCtx({ id: 'tight-case' }, { checks: 'green' })
    await checks()(green)

    const inc1 = fakeCtx({}, { kind: 'incident' })
    await signal()(inc1)
    const inc2 = fakeCtx({}, { kind: 'incident' })
    await signal()(inc2)
    const b = inc2.body as { breaker: { active: boolean }; tightenedCases: number }
    expect(b.breaker.active).toBe(true)
    expect(b.tightenedCases).toBe(1)

    const c = loadCase('tight-case')!
    expect(c.risk.tier).toBe('high')
    expect(c.approvals[0].invalidatedBy).toBe('policy_tightened')
  })
})
