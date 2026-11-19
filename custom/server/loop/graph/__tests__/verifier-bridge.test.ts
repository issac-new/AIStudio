// P1 修复波（终审 Important 5）— Verifier 生产依赖桥接
// 断言：human 门禁经 requestHumanApproval → 'pending' → verifier overall='pending'
// （validation 节点据此发 approval interrupt → run awaiting-input → REST resume 闭环）；
// judge 显式声明降级（不注入假 judge——VerificationRecord 无 judge pending 态，
// 恒失败的假 judge 会让 judge 意图契约永远 fail → repair 烧穿 escalated，生产死锁）。
// 全程 mock，不跑真实子进程（programmatic checks 留空数组即不执行命令）。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createProductionVerifierDeps } from '../verifier-bridge'
import { Verifier } from '../../engine/verifier'
import type { TaskContract, LoopInstance } from '../../types'

function makeLoop(): LoopInstance {
  return {
    id: 'loop-1', name: 'L', goal: 'g', stopCondition: '', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'validation', status: 'running',
    autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '',
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 1, maxCostTotal: 10, killMode: 'notify', warningThreshold: 0.8 },
    stats: { totalIterations: 1, tasksDiscovered: 1, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 1 },
  }
}

function makeContract(over: Partial<TaskContract> = {}): TaskContract {
  return {
    id: 'task/a', loopId: 'loop-1',
    source: { type: 'git-commit', ref: 'sha', summary: 's', rawPayload: null },
    readPlan: { requiredReads: [] }, writeBoundary: [],
    verificationIntent: { programmatic: [], judge: null, human: null },
    resultTemplate: { artifactType: 'report', requiredFiles: [] },
    worktreeId: null, assignee: 'maker', status: 'verifying', attempts: 0, maxAttempts: 3,
    ...over,
  }
}

describe('createProductionVerifierDeps (I5)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('requestHumanApproval defers to the graph interrupt by returning pending', async () => {
    const logs: string[] = []
    const deps = createProductionVerifierDeps({ log: m => logs.push(m) })
    await expect(deps.requestHumanApproval!('task/a', ['alice', 'bob'])).resolves.toBe('pending')
    expect(logs.some(l => l.includes('task/a') && l.includes('alice, bob'))).toBe(true)
  })

  it('closes the human approval loop at the verifier level: human gate → overall pending', async () => {
    const verifier = new Verifier(createProductionVerifierDeps({ log: () => {} }))
    const contract = makeContract({
      verificationIntent: { programmatic: [], judge: null, human: { gate: 'always', approvers: ['alice'] } },
    })
    const record = await verifier.verify(contract, makeLoop())
    // overall='pending' 是 phase-nodes validation 节点发 approval:<id>@<n> interrupt 的触发条件
    expect(record.overall).toBe('pending')
    expect(record.results.human).toBeNull()
    expect(record.contractId).toBe('task/a')
  })

  it('declares judge disabled once when env is absent (explicit, not silent)', () => {
    vi.stubEnv('GRAPH_JUDGE_BASE_URL', '')
    vi.stubEnv('GRAPH_JUDGE_MODEL', '')
    vi.stubEnv('GRAPH_JUDGE_ENFORCE', '0')
    const logs: string[] = []
    createProductionVerifierDeps({ log: m => logs.push(m) })
    expect(logs.filter(l => l.includes('judge disabled'))).toHaveLength(1)
  })

  it('enables callJudge and defaultJudge when env is configured', () => {
    vi.stubEnv('GRAPH_JUDGE_BASE_URL', 'http://judge.local/v1')
    vi.stubEnv('GRAPH_JUDGE_MODEL', 'judge-model')
    vi.stubEnv('GRAPH_JUDGE_ENFORCE', '1')
    const deps = createProductionVerifierDeps({ log: () => {} })
    expect(typeof deps.callJudge).toBe('function')
    expect(deps.defaultJudge).toEqual({
      model: 'judge-model', rubric: expect.any(String), minScore: 0.7,
    })
  })

  it('defaultJudge applies to contracts without an explicit judge intent', async () => {
    const verifier = new Verifier({
      callJudge: async () => ({ score: 0.9, reasoning: 'looks good' }),
      defaultJudge: { model: 'judge-model', rubric: 'rubric', minScore: 0.7 },
    })
    const record = await verifier.verify(makeContract(), makeLoop())
    expect(record.results.judge).toMatchObject({
      model: 'judge-model', status: 'passed', score: 0.9,
    })
    expect(record.overall).toBe('passed')
  })

  it('judge-intent contract without callJudge skips judge and passes on programmatic+guard (documented P1 posture)', async () => {
    const verifier = new Verifier(createProductionVerifierDeps({ log: () => {} }))
    const contract = makeContract({
      verificationIntent: { programmatic: [], judge: { model: 'm', rubric: 'r', minScore: 0.8 }, human: null },
    })
    const record = await verifier.verify(contract, makeLoop())
    expect(record.results.judge).toBeNull() // judge 项跳过（README caveat 声明的 P1 语义）
    expect(record.overall).toBe('passed')
  })
})
