// overlay[delivery]: 跨轮评测榜测试面（2026-10-24 聚合层）。
// 纯函数正反例 + tmpdir SIM 根起 koa 端到端。纪律：缺值不补零、名次可复算、前沿非支配可断言。

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import { createServer } from 'node:http'

import { BENCH_METRICS, benchValuesOf, buildSwarmBench } from '../swarm-bench'
import type { SwarmCollabReadout } from '../swarm-collab'
import { deliveryRouter } from '../delivery-controller'

interface ReadoutOpts {
  run?: string
  done?: number
  total?: number
  chars?: number
  tasks?: number
  fidelity?: number | null
  backfill?: number | null
  echo?: number | null
  bcr?: number | null
  sources?: string[]
}

function mkReadout(opts: ReadoutOpts = {}): SwarmCollabReadout {
  const {
    run = 'r', done = 0, total = 0, chars = 0, tasks = 0,
    fidelity = null, backfill = null, echo = null, bcr = null, sources = [],
  } = opts
  return {
    run,
    generatedAt: '2026-10-24T00:00:00.000Z',
    sources,
    communication: {
      dispatchCount: 0,
      dispatchChars: chars,
      distinctSenders: 0,
      distinctTargets: 0,
      taskIds: Array.from({ length: tasks }, (_, i) => `AN-${i}`),
      morCharsPerTask: tasks > 0 ? chars / tasks : null,
      morBasis: 'chars',
      topology: {
        basis: 'dispatch-graph',
        nodes: 0,
        edges: 0,
        selfLoopShare: null,
        outCentralization: null,
        inCentralization: null,
        topHubShare: null,
        topHub: null,
      },
      cadence: {
        basis: 'dispatch-time-of-day',
        spanSeconds: null,
        medianGapSeconds: null,
        dispatchesPerMinute: null,
      },
      intentFidelity: {
        anchoredTasks: 0,
        preserved: 0,
        rate: fidelity,
        basis: 'anchor',
        textSimilarity: null,
        textDispatchCount: 0,
      },
      deadlockSignals: {
        backfillCount: 0,
        backfillRatio: backfill,
        receiptMissing: 0,
        raciMissing: 0,
        nudgeCount: 0,
      },
    },
    credit: {
      agents: [],
      criticalityBasis: 'observed',
      shapleyBasis: 'task-coalition-proxy',
      coalitionsCovered: 0,
      taskCompletion: { done, total },
    },
    pareto: { basis: 'chars', points: [], frontierSize: 0 },
    social: {
      uat: { total: 0, pass: 0, conditional: 0, reject: 0 },
      unconditionalPassRate: echo,
      gateRejects: 0,
      gateFailIssues: 0,
      issuesCaught: 0,
      byzantine: bcr == null
        ? { status: 'no_data', note: '' }
        : { status: 'injected', note: '', bcr },
    },
  }
}

function entryOf(run: string, opts: Omit<ReadoutOpts, 'run'>): { run: string; readout: SwarmCollabReadout } {
  return { run, readout: mkReadout({ run, ...opts }) }
}

describe('评测榜 · 指标与名次（纯函数）', () => {
  it('指标换算：完成率/每完成锚成本；无完成锚 → null', () => {
    const v = benchValuesOf(mkReadout({ done: 5, total: 10, chars: 1000, tasks: 10, fidelity: 0.8, backfill: 0.2, echo: 0.5, bcr: 0.75 }))
    expect(v.completionRate).toBeCloseTo(0.5)
    expect(v.morCharsPerTask).toBeCloseTo(100)
    expect(v.charsPerCompletedTask).toBeCloseTo(200)
    expect(v.intentFidelityRate).toBeCloseTo(0.8)
    expect(v.backfillRatio).toBeCloseTo(0.2)
    expect(v.echoPassRate).toBeCloseTo(0.5)
    expect(v.byzantineBcr).toBeCloseTo(0.75)
    expect(benchValuesOf(mkReadout({ done: 0, total: 3, chars: 900, tasks: 3 })).charsPerCompletedTask).toBeNull()
  })

  it('逐指标名次（并列同名次）＋综合名次=可用指标平均名次', () => {
    const report = buildSwarmBench([
      entryOf('r1', { done: 10, total: 10, chars: 1000, tasks: 10, fidelity: 0.9, backfill: 0.8, echo: 0.5 }),
      entryOf('r2', { done: 5, total: 10, chars: 500, tasks: 10, fidelity: 0.5, backfill: 0.2, echo: 0.1 }),
      entryOf('r3', { done: 5, total: 10, chars: 1500, tasks: 10, fidelity: 0.7, backfill: 0.4, echo: 0.3 }),
    ])
    const byRun = new Map(report.entries.map(e => [e.run, e]))
    expect(byRun.get('r1')?.ranks.completionRate).toBe(1)
    expect(byRun.get('r2')?.ranks.completionRate).toBe(2) // 与 r3 并列
    expect(byRun.get('r3')?.ranks.completionRate).toBe(2)
    expect(byRun.get('r2')?.ranks.morCharsPerTask).toBe(1)
    expect(byRun.get('r1')?.ranks.charsPerCompletedTask).toBe(1) // 与 r2 同为 100
    expect(byRun.get('r2')?.overallRank).toBeCloseTo(1.5)
    expect(byRun.get('r1')?.overallRank).toBeCloseTo(11 / 6)
    expect(byRun.get('r3')?.overallRank).toBeCloseTo(14 / 6)
    expect(report.entries.map(e => e.run)).toEqual(['r2', 'r1', 'r3'])
    // BCR 三轮均无值 → 不参与名次
    expect(report.entries.every(e => e.ranks.byzantineBcr == null)).toBe(true)
    expect(report.metrics).toEqual(BENCH_METRICS)
  })

  it('缺值不补零：无指标轮 → 综合名次 null、前沿 null', () => {
    const report = buildSwarmBench([
      entryOf('full', { done: 1, total: 1, chars: 100, tasks: 1, fidelity: 1, backfill: 0, echo: 0 }),
      entryOf('empty', {}),
    ])
    const empty = report.entries.find(e => e.run === 'empty')
    expect(empty?.overallRank).toBeNull()
    expect(empty?.onFrontier).toBeNull()
    expect(Object.values(empty?.ranks ?? {}).every(r => r == null)).toBe(true)
    expect(report.entries.find(e => e.run === 'full')?.overallRank).toBe(1)
  })

  it('帕累托前沿：低成本高收益支配；单轮也标前沿', () => {
    const report = buildSwarmBench([
      entryOf('a', { done: 9, total: 10, chars: 9000, tasks: 10 }), // 成本 1000 / 收益 .9
      entryOf('b', { done: 9, total: 10, chars: 4500, tasks: 10 }), // 成本 500 支配 a
      entryOf('c', { done: 10, total: 10, chars: 20000, tasks: 10 }), // 成本 2000 / 收益 1.0
    ])
    const byRun = new Map(report.entries.map(e => [e.run, e]))
    expect(byRun.get('a')?.onFrontier).toBe(false)
    expect(byRun.get('b')?.onFrontier).toBe(true)
    expect(byRun.get('c')?.onFrontier).toBe(true)
    expect(report.pareto.frontierSize).toBe(2)
    expect(report.pareto.costKey).toBe('charsPerCompletedTask')
    expect(report.pareto.benefitKey).toBe('completionRate')

    const single = buildSwarmBench([entryOf('solo', { done: 2, total: 2, chars: 400, tasks: 2 })])
    expect(single.entries[0].overallRank).toBe(1)
    expect(single.entries[0].onFrontier).toBe(true)
  })
})

describe('评测榜 · 端点（夹具端到端）', () => {
  const RUN_A = '20261021-fx'
  const RUN_B = '20261020-fx'
  const RUN_EMPTY = '20261019-empty'
  let dir: string
  let server: ReturnType<typeof createServer>
  let base = ''

  function writeRun(run: string, scenario: string): void {
    const evidenceDir = join(dir, 'runs', run, 'evidence')
    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(join(evidenceDir, 'scenario.log'), scenario)
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'swarm-bench-'))
    writeRun(RUN_A, [
      '[mux 10:00:00] [a] 派发 ($A1): @a-agent:matrix.test 执行任务 AN-1（csw-a 模块）',
      '[mux 10:10:00] [a] 派发 ($A2): @b-agent:matrix.test 执行任务 AN-2（csw-b 模块）',
      '[mux 10:20:00] [b] 派发 ($A3): @c-agent:matrix.test 执行任务 AN-3（csw-c 模块）',
      '[mux 10:30:00] [c] 派发 ($A4): @d-agent:matrix.test 执行任务 AN-4（csw-d 模块）',
      '[mux 11:00:00] [真值] 仓库出现 docs/analysis/AN-1.md ✓',
      '[mux 11:10:00] [真值] 仓库出现 docs/analysis/AN-2.md ✓',
    ].join('\n'))
    writeRun(RUN_B, [
      '[mux 09:00:00] [a] 派发 ($B1): @a-agent:matrix.test 执行任务 AN-1（csw-a 模块）',
      '[mux 09:05:00] [a] 派发 ($B2): @b-agent:matrix.test 执行任务 AN-2（csw-b 模块）',
      '[mux 09:15:00] [b] 派发 ($B3): @b-agent:matrix.test 执行任务 AN-3（csw-c 模块）',
      '[mux 10:00:00] [真值] 仓库出现 docs/analysis/AN-1.md ✓',
      '[mux 10:05:00] [真值] 仓库出现 docs/analysis/AN-2.md ✓',
      '[mux 10:10:00] [真值] 仓库出现 docs/analysis/AN-3.md ✓',
    ].join('\n'))
    mkdirSync(join(dir, 'runs', RUN_EMPTY), { recursive: true })
    process.env.SIM_OBSERVER_ROOT = dir
    const app = new Koa()
    app.use(deliveryRouter.routes())
    server = createServer(app.callback())
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })

  afterAll(() => {
    server?.close()
    delete process.env.SIM_OBSERVER_ROOT
    rmSync(dir, { recursive: true, force: true })
  })

  type BenchBody = {
    available: boolean
    runsRequested: number
    runsScanned: number
    entries: Array<{ run: string; overallRank: number | null; onFrontier: boolean | null; values: Record<string, number | null> }>
    pareto: { frontierSize: number }
  }

  it('默认扫描：有证据的 run 入榜，空 run 不占榜', async () => {
    const res = await fetch(`${base}/api/hermes/delivery/swarm-bench`)
    expect(res.status).toBe(200)
    const body = await res.json() as BenchBody
    expect(body.available).toBe(true)
    expect(body.runsRequested).toBe(3)
    expect(body.runsScanned).toBe(2)
    expect(body.entries.map(e => e.run).sort()).toEqual([RUN_B, RUN_A])
    expect(body.entries.every(e => typeof e.overallRank === 'number')).toBe(true)
    expect(body.pareto.frontierSize).toBeGreaterThanOrEqual(1)
    const a = body.entries.find(e => e.run === RUN_A)
    expect(a?.values.completionRate).toBeCloseTo(2 / 4) // 4 任务 2 完成
  })

  it('?runs= 显式单轮 → 只入该轮；非法 run → 400', async () => {
    const res = await fetch(`${base}/api/hermes/delivery/swarm-bench?runs=${RUN_B}`)
    expect(res.status).toBe(200)
    const body = await res.json() as BenchBody
    expect(body.runsScanned).toBe(1)
    expect(body.entries).toHaveLength(1)
    expect(body.entries[0].run).toBe(RUN_B)
    expect(body.entries[0].overallRank).toBe(1)

    const bad = await fetch(`${base}/api/hermes/delivery/swarm-bench?runs=../escape`)
    expect(bad.status).toBe(400)
  })
})
