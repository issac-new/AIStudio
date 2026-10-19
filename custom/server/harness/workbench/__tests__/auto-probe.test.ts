// 一键自动探测服务层守门：批准后全链（物化→驱动→判分→回填）+ 三道闸（状态/可执行件/预算）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { startAutoProbe, createProposal, attachBaseline, submitProposal, decideProposal, listProposals, ServiceError } from '../service'
import { readStore, _useStoreFileForTests } from '../store'
import { getRun } from '../../../eval/store'
import type { SpawnRun } from '../probe-runner'
import type { AskFn } from '../../../eval/judge'

/** 判分离线注入：测试不走真实裁判服务（本机 8000 端口真有 clef 在跑）。 */
const offlineAsk: AskFn = async () => { throw new Error('offline judge (test)') }

let dir: string

function fakeSpawn(cost: { prompt: number; completion: number }): SpawnRun {
  let n = 0
  return async (_prompt, env) => {
    n += 1
    const lines = [
      JSON.stringify({ type: 'header', session_id: `sess-auto-${n}-${Date.now()}`, model: 'glm-4.7', provider: 'zai' }),
      JSON.stringify({ type: 'chunk', kind: 'llm_span', phase: 'post', usage: { prompt_tokens: cost.prompt, completion_tokens: cost.completion } }),
    ]
    writeFileSync(join(env.HERMES_RUN_TRACE_DIR!, `sess-auto-${n}.jsonl`), lines.join('\n') + '\n')
    return { ok: true }
  }
}

async function waitJob(job: { status: string }, timeoutMs = 15_000): Promise<void> {
  const started = Date.now()
  while (job.status === 'running') {
    if (Date.now() - started > timeoutMs) throw new Error('自动探测任务超时未完成')
    await new Promise((r) => setTimeout(r, 25))
  }
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'harness2-autoprobe-'))
  process.env.HERMES_HOME = join(dir, 'home')
  _useStoreFileForTests(join(dir, 'workbench', 'workbench.json'))
  process.env.EVAL_STORE = join(dir, 'eval')
  process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'approvals.json')
  mkdirSync(join(process.env.HERMES_HOME, 'profiles/p1'), { recursive: true })
  writeFileSync(join(process.env.HERMES_HOME, 'profiles/p1/SOUL.md'), 'old persona')

  const store = await import('../../../eval/store')
  store._useStoreDirForTests(process.env.EVAL_STORE)
  const set = store.createSet({
    name: '探测集', track: 'e2e',
    tasks: [
      { id: 't1', problem: '题目一', expectedBehavior: '行为一', rubric: [{ id: 'a1', text: '完成', expect: 'yes', kind: 'result' }] },
      { id: 't2', problem: '题目二', expectedBehavior: '行为二', rubric: [{ id: 'a1', text: '完成', expect: 'yes', kind: 'result' }] },
    ],
  })
  if (!set.ok) throw new Error(JSON.stringify(set))
  store.appendRun({
    id: 'run-base', setId: set.set.id, target: {}, k: 2, status: 'done', attempts: [],
    aggregates: {
      taskCount: 2, passAt1: 0.5, passAtK: 0.5,
      byLayer: { result: 0.5, trajectory: 0.5, risk: 'none', efficiency: { avgTokens: 1000, avgCostUsd: 1, avgSteps: 10, avgDurationMs: 1000 } },
      unknownRatio: 0, rubricDrilldownHint: false, riskVeto: false, statisticallyInsufficient: false, judgeOnline: true,
    },
    createdAt: Date.now(),
  })
})

afterEach(() => {
  for (const k of ['HERMES_HOME', 'HARNESS2_STORE', 'EVAL_STORE', 'HERMES_APPROVALS_LOG_FILE']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

async function approvedProposal(over: Record<string, unknown> = {}) {
  const created = await createProposal({
    title: '收紧提示词', hypothesis: '减少返工', surfaceKey: 'system_prompt',
    targetPath: 'profiles/p1/SOUL.md', budgetCapUsd: 5, evidenceRefs: ['task:t1'],
    variants: [{ label: '候选 A', content: 'persona A' }],
    ...over,
  })
  await attachBaseline(created.id, 'run-base')
  await submitProposal(created.id)
  await decideProposal(created.id, 'approve', 'reviewer', '')
  return created.id
}

describe('一键自动探测', () => {
  it('批准后全链：驱动→判分→回填运行号→对比入账', async () => {
    const id = await approvedProposal()
    const job = await startAutoProbe(id, { setId: (await import('../../../eval/store')).listSets()[0].id, spawnRun: fakeSpawn({ prompt: 100, completion: 50 }), actor: 'tester', judgeAsk: offlineAsk })
    await waitJob(job)
    expect(job.status).toBe('done')
    const p = listProposals().find((x) => x.id === id)!
    const probe = p.probes[0]
    expect(probe.status).toBe('recorded')
    expect(probe.evalRunId).toBeTruthy()
    expect(probe.autoRun?.status).toBe('done')
    expect(probe.autoRun?.tasksDone).toBe(2)
    expect(probe.autoRun?.estimatedTasks).toBe(0)
    expect(probe.autoRun?.costUsd).toBeGreaterThan(0)
    const run = getRun(probe.evalRunId!)!
    expect(run).toBeTruthy()
    expect(run.target.harnessRef).toBe(`${id}:v1`)
    expect(run.aggregates.judgeOnline).toBe(false) // 测试环境无裁判后端：如实 unknown
    expect(probe.contrast).toBeTruthy()
  })

  it('预算硬停：单题真实成本超剩余额度即停，部分样本照常判分回填', async () => {
    const id = await approvedProposal({ budgetCapUsd: 1.0 })
    const setId = (await import('../../../eval/store')).listSets()[0].id
    const job = await startAutoProbe(id, {
      setId, estimatedCostPerTaskUsd: 0.1,
      spawnRun: fakeSpawn({ prompt: 1_000_000, completion: 1_000_000 }),
      judgeAsk: offlineAsk,
    })
    await waitJob(job)
    expect(job.status).toBe('done')
    const p = listProposals().find((x) => x.id === id)!
    const probe = p.probes[0]
    expect(probe.autoRun?.status).toBe('stopped')
    expect(probe.autoRun?.reason).toBe('budget_stop')
    expect(probe.autoRun?.tasksDone).toBe(1)
    expect(probe.status).toBe('recorded') // 已完成部分照常判分入账
    expect(getRun(probe.evalRunId!)).toBeTruthy()
  })

  it('未批准提案拒绝（409）', async () => {
    const created = await createProposal({
      title: 't', hypothesis: 'h', surfaceKey: 'system_prompt', targetPath: 'profiles/p1/SOUL.md',
      budgetCapUsd: 5, evidenceRefs: ['task:t1'], variants: [{ content: 'x' }],
    })
    const err = await startAutoProbe(created.id, { setId: 'any', spawnRun: fakeSpawn({ prompt: 1, completion: 1 }) }).catch((e) => e)
    expect(err).toBeInstanceOf(ServiceError)
    expect((err as ServiceError).status).toBe(409)
  })

  it('候选含可执行件拒绝（400，列出禁跑路径）', async () => {
    const id = await approvedProposal({
      variants: [{ label: 'bad', files: [{ path: 'scripts/evil.py', content: 'print(1)' }] }],
    })
    const setId = (await import('../../../eval/store')).listSets()[0].id
    const err = await startAutoProbe(id, { setId, spawnRun: fakeSpawn({ prompt: 1, completion: 1 }) }).catch((e) => e)
    expect(err).toBeInstanceOf(ServiceError)
    expect((err as ServiceError).status).toBe(400)
    expect((err as ServiceError).message).toContain('scripts/evil.py')
  })

  it('预算预估超剩余额度拒绝（400）', async () => {
    const id = await approvedProposal({ budgetCapUsd: 0.1 })
    const setId = (await import('../../../eval/store')).listSets()[0].id
    const err = await startAutoProbe(id, { setId, spawnRun: fakeSpawn({ prompt: 1, completion: 1 }) }).catch((e) => e)
    expect((err as ServiceError).status).toBe(400)
    expect((err as ServiceError).message).toContain('预算不足')
  })

  it('二次发起同提案在途探测返回 409', async () => {
    const id = await approvedProposal()
    const setId = (await import('../../../eval/store')).listSets()[0].id
    const slowSpawn: SpawnRun = async (_p, env) => {
      await new Promise((r) => setTimeout(r, 300))
      return fakeSpawn({ prompt: 1, completion: 1 })(_p, env)
    }
    const job = await startAutoProbe(id, { setId, spawnRun: slowSpawn, judgeAsk: offlineAsk })
    const err = await startAutoProbe(id, { setId, spawnRun: fakeSpawn({ prompt: 1, completion: 1 }) }).catch((e) => e)
    expect((err as ServiceError).status).toBe(409)
    await waitJob(job)
  })
})
