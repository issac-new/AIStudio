// 决策图谱守门（乙4/乙5，2026-09-30 调研落地）：bridge 客户端 fail-soft/串行/尾行解析、
// 记录器去重与 outcome 映射、先例缓存 TTL、规则闸词表校验与 enforce 语义、HTTP 投影、
// gate 摄取幂等；末组为真实 python venv 集成（缺席 skip 如实标注）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setBridgeRunnerForTests } from '../../decisiongraph/semantica-client'

let dir: string
let calls: Array<{ args: string[]; input: string | null }>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dg-'))
  calls = []
  // 假 python 须是真实存在的文件（semanticaPython 会 existsSync 探测）；
  // 假执行器接管后不会真执行它。
  const fakePy = join(dir, 'pyfake')
  writeFileSync(fakePy, '#!/bin/sh\n')
  process.env.SEMANTICA_PYTHON = fakePy
  process.env.SEMANTICA_STUDIO_KG = join(dir, 'kg.json')
})
afterEach(() => {
  for (const k of ['SEMANTICA_PYTHON', 'SEMANTICA_STUDIO_KG', 'HERMES_DECISION_GRAPH', 'GOVERNANCE_DIR', 'GOVERNANCE_RULES_MODE', 'GOVERNANCE_QGATE_RUNS', 'GOVERNANCE_GATE_SYNC_MARKER']) {
    delete process.env[k]
  }
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

/** 假执行器：记录调用并按用例回放 stdout。 */
function fakeRunner(stdout: (call: { args: string[]; input: string | null }) => string | Error): void {
  setBridgeRunnerForTests(async (python, args, input) => {
    void python
    calls.push({ args, input })
    const out = stdout({ args, input })
    if (out instanceof Error) throw out
    return `Failed to initialize KG components: gensim is required (warning line)\n${out}\n`
  })
}

describe('bridge 客户端（乙4）：fail-soft/串行/尾行 JSON 解析', () => {
  it('record 走 record op 且传 kg 路径；尾行 JSON 正确解析', async () => {
    const { recordDecision } = await import('../../decisiongraph/semantica-client')
    fakeRunner(() => JSON.stringify({ ok: true, decisionId: 'uuid-1', precedentOf: null }))
    const res = await recordDecision({ category: 'dispatch', scenario: 's', reasoning: 'r', outcome: 'approved', linkPrecedent: true })
    expect(res).toEqual({ decisionId: 'uuid-1', precedentOf: null })
    expect(calls[0].args[0]).toBe('record')
    expect(JSON.parse(calls[0].input!).link_precedent).toBe(true)
  })

  it('执行器抛错 → null 不抛（主链路保护）', async () => {
    const { recordDecision } = await import('../../decisiongraph/semantica-client')
    fakeRunner(() => new Error('boom'))
    expect(await recordDecision({ category: 'x', scenario: 's', reasoning: 'r', outcome: 'approved' })).toBeNull()
  })

  it('HERMES_DECISION_GRAPH=0 → 直接 null 不起进程', async () => {
    process.env.HERMES_DECISION_GRAPH = '0'
    const { recordDecision } = await import('../../decisiongraph/semantica-client')
    fakeRunner(() => JSON.stringify({ ok: true }))
    expect(await recordDecision({ category: 'x', scenario: 's', reasoning: 'r', outcome: 'approved' })).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe('记录器（乙4）：去重 + outcome 映射 + fire-and-forget', () => {
  it('同 commandId 派发只落一次账；outcome 映射冻结', async () => {
    const rec = await import('../../decisiongraph/decision-recorder')
    rec.resetRecorderStateForTests()
    fakeRunner(() => JSON.stringify({ ok: true, decisionId: 'u', precedentOf: null }))
    const { recordDispatchDecision, dispatchOutcomeToDecision } = rec
    recordDispatchDecision({ column: 'review', specialist: 'dev-exec', provider: 'zcode', reason: 'queued', commandId: 'c-1', text: 't' })
    recordDispatchDecision({ column: 'review', specialist: 'dev-exec', provider: 'zcode', reason: 'queued', commandId: 'c-1', text: 't' })
    await new Promise((r) => setTimeout(r, 20))
    expect(calls.filter((c) => c.args[0] === 'record')).toHaveLength(1)
    expect(dispatchOutcomeToDecision('queued').outcome).toBe('approved')
    expect(dispatchOutcomeToDecision('deferred').outcome).toBe('deferred')
    expect(dispatchOutcomeToDecision('engine_unreachable').outcome).toBe('rejected')
  })
})

describe('先例回灌（乙5）：相似阈值 + TTL 缓存', () => {
  it('高相似先例 → 拼行文案（含"仅供参考"防历史绑架）；低相似 → null', async () => {
    const rec = await import('../../decisiongraph/decision-recorder')
    rec.resetRecorderStateForTests()
    const { precedentLineFor } = rec
    fakeRunner(({ args }) => args[0] === 'similar'
      ? JSON.stringify({ ok: true, results: [{ id: 'd1', category: 'dispatch', scenario: 'x', outcome: 'approved', confidence: 0.9, decidedBy: 'studio', similarity: 0.52 }] })
      : JSON.stringify({ ok: true }))
    const hit = await precedentLineFor('k1', 's')
    expect(hit.line).toContain('52%')
    expect(hit.line).toContain('仅供参考')
    // 第二次走缓存（bridge similar 调用数不增）
    const again = await precedentLineFor('k1', 's')
    expect(again.fromCache).toBe(true)
    expect(calls.filter((c) => c.args[0] === 'similar')).toHaveLength(1)

    setBridgeRunnerForTests(null)
    fakeRunner(() => JSON.stringify({ ok: true, results: [{ id: 'd2', scenario: 'y', outcome: 'approved', confidence: 0.9, similarity: 0.31 }] }))
    const miss = await precedentLineFor('k2', 's')
    expect(miss.line).toBeNull()
  })
})

describe('决策规则闸（乙6）：词表校验/求值/enforce', () => {
  const RULES = (extra: string) => `version: 1\nreviewedAt: "2026-09-30"\nmode: warn\nrules:\n${extra}`
  const LEDGER = `version: 1\nreviewedAt: "2026-09-30"\ndomains: []\ncapabilities: []\nunits:\n  - id: dev-exec\n    capability: c\n    name: n\n    primary: true\n    kind: lane-specialist\n    owner: o\n    lifecycle: retire-candidate\n    sloTier: important\n    skills: []\n    refs: { file: x }\n`

  it('仓内注册表零 problems 且规则可求值；未知谓词键/非法 then 必红（变异）', async () => {
    const rules = await import('../../governance/decision-rules')
    const repo = rules.loadDecisionRules()
    expect(repo.exists).toBe(true)
    expect(repo.problems).toEqual([])

    // 变异 fixture：未知谓词键 + 非法动作
    const govDir = join(dir, 'gov-bad')
    mkdirSync(govDir)
    writeFileSync(join(govDir, 'capability-ledger.yaml'), LEDGER)
    writeFileSync(join(govDir, 'decision-rules.yaml'), RULES(
      '  - id: bad-key\n    when: { budgetLeft: 0.2 }\n    then: deny\n    message: x\n  - id: bad-then\n    when: { unitTier: core }\n    then: block\n    message: y\n'))
    process.env.GOVERNANCE_DIR = govDir
    const bad = rules.loadDecisionRules()
    expect(bad.problems.some((p) => p.includes('未知谓词键 budgetLeft'))).toBe(true)
    expect(bad.problems.some((p) => p.includes('then 须为 deny|warn'))).toBe(true)
  })

  it('retire-candidate 单元命中 deny；enforce 模式抛 DecisionRuleError；off 全过', async () => {
    const govDir = join(dir, 'gov-ok')
    mkdirSync(govDir)
    writeFileSync(join(govDir, 'capability-ledger.yaml'), LEDGER)
    writeFileSync(join(govDir, 'decision-rules.yaml'), RULES(
      '  - id: retire-no-new\n    when: { unitLifecycle: retire-candidate }\n    then: deny\n    message: 退役候选禁派\n'))
    process.env.GOVERNANCE_DIR = govDir
    const rules = await import('../../governance/decision-rules')
    const warnMode = rules.checkDecisionRulesForDispatch({ specialist: 'dev-exec', column: 'doing' })
    expect(warnMode.violations.map((v) => v.ruleId)).toContain('retire-no-new')

    process.env.GOVERNANCE_RULES_MODE = 'enforce'
    expect(() => rules.checkDecisionRulesForDispatch({ specialist: 'dev-exec' }))
      .toThrow(/退役候选禁派/)

    process.env.GOVERNANCE_RULES_MODE = 'off'
    const off = rules.checkDecisionRulesForDispatch({ specialist: 'dev-exec' })
    expect(off.violations).toHaveLength(0)
  })

  it('台账无档单元谓词不命中（不编造 lifecycle）', async () => {
    const rules = await import('../../governance/decision-rules')
    const res = rules.evaluateDecisionRules({ specialist: 'ghost-unit' })
    expect(res.violations).toHaveLength(0)
  })
})

describe('HTTP 投影（governance prefix 复用=零新挂载点）', () => {
  it('status/decisions/decision-rules 三路 200', async () => {
    const { createServer } = await import('node:http')
    fakeRunner(({ args }) => args[0] === 'status'
      ? JSON.stringify({ ok: true, exists: true, nodes: 3, decisions: 2 })
      : JSON.stringify({ ok: true, decisions: [{ id: 'd1' }], total: 1 }))
    const Koa = (await import('koa')).default
    const { governanceRoutes } = await import('../../governance/governance-controller')
    const app = new Koa()
    app.use(governanceRoutes.routes())
    const server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    try {
      const st = await fetch(`http://127.0.0.1:${port}/api/governance/decision-graph/status`)
      expect(st.status).toBe(200)
      expect(((await st.json()) as { decisions: number }).decisions).toBe(2)
      const dc = await fetch(`http://127.0.0.1:${port}/api/governance/decision-graph/decisions?limit=10`)
      expect(((await dc.json()) as { total: number }).total).toBe(1)
      const dr = await fetch(`http://127.0.0.1:${port}/api/governance/decision-rules`)
      expect(((await dr.json()) as { problems: string[] }).problems).toEqual([])
    } finally {
      server.close()
    }
  })

  it('sync-gates 摄取幂等（seen 标记防重）', async () => {
    const runsDir = join(dir, 'runs')
    mkdirSync(runsDir)
    writeFileSync(join(runsDir, 'run-001.json'), JSON.stringify({ verdict: 'pass', gate: 'qgate' }))
    writeFileSync(join(runsDir, 'run-002.json'), JSON.stringify({ verdict: 'fail', gate: 'qgate' }))
    process.env.GOVERNANCE_QGATE_RUNS = runsDir
    process.env.GOVERNANCE_GATE_SYNC_MARKER = join(dir, 'marker.json')
    fakeRunner(() => JSON.stringify({ ok: true, decisionId: 'u', precedentOf: null }))
    const { createServer } = await import('node:http')
    const Koa = (await import('koa')).default
    const { governanceRoutes } = await import('../../governance/governance-controller')
    const app = new Koa()
    app.use(governanceRoutes.routes())
    const server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    try {
      const r1 = await fetch(`http://127.0.0.1:${port}/api/governance/decision-graph/sync-gates`, { method: 'POST' })
      const b1 = await r1.json() as { ingested: number }
      expect(b1.ingested).toBe(2)
      await new Promise((r) => setTimeout(r, 30))
      const r2 = await fetch(`http://127.0.0.1:${port}/api/governance/decision-graph/sync-gates`, { method: 'POST' })
      const b2 = await r2.json() as { ingested: number }
      expect(b2.ingested).toBe(0)  // 幂等：同 run 不重复落账
      expect(calls.filter((c) => c.args[0] === 'record')).toHaveLength(2)
    } finally {
      server.close()
    }
  })
})

describe('真实 python 集成（venv 缺席则 skip 如实标注）', () => {
  it('record→similar→list roundtrip', { timeout: 60000 }, async () => {
    const { existsSync } = await import('node:fs')
    const { homedir } = await import('node:os')
    const py = join(homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'python')
    if (!existsSync(py)) {
      console.warn('[dg-integration] venv python 缺席，集成 roundtrip 跳过（unit 面已覆盖协议）')
      return
    }
    setBridgeRunnerForTests(null)
    process.env.SEMANTICA_PYTHON = py
    const kg = join(dir, 'integration-kg.json')
    process.env.SEMANTICA_STUDIO_KG = kg
    const { recordDecision, findSimilar, listDecisions } = await import('../../decisiongraph/semantica-client')
    const r1 = await recordDecision({ category: 'dispatch', scenario: '[kanban:review] dev-exec 集成测试', reasoning: 'r', outcome: 'approved', confidence: 0.9, linkPrecedent: true })
    expect(r1?.decisionId).toBeTruthy()
    const r2 = await recordDecision({ category: 'dispatch', scenario: '[kanban:review] dev-exec 集成测试（第二次同类派单）', reasoning: 'r2', outcome: 'approved', confidence: 0.85, linkPrecedent: true })
    expect(r2?.precedentOf).toBe(r1?.decisionId)  // 因果边实建
    const sims = await findSimilar('[kanban:review] dev-exec 集成测试', 'dispatch', 3)
    expect(sims.length).toBeGreaterThanOrEqual(1)
    const list = await listDecisions(10)
    expect(list.total).toBeGreaterThanOrEqual(2)
  })
})
