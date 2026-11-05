// v0.4 治理可信度修复：判定四态化与健康体检的守门测试。
// 核心断言：CONDITIONAL 不再把「执行器报错 / 证据不足 / 失败被容忍 / 条件证据」压成一态；
// health 对 error→DEGRADED、insufficient→SKIP、legacy→DEGRADED 给出可区分结论。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { decide } from '../src/core/decision.js'
import { parseRun } from '../src/core/parse.js'
import { resolveProfile } from '../src/core/profile.js'
import { storePaths, saveRun, latestRuns, listRuns, loadRun } from '../src/core/store.js'
import { assessHealth, gatesForScope } from '../src/core/health.js'
import { runScopeExecutor } from '../src/executors/scope.js'
import type { Evidence, ExecutorSpec, GateSpec, GateRun } from '../src/core/types.js'

const gateSpec = (over: Partial<GateSpec['spec']> = {}): GateSpec => ({
  apiVersion: 'qgate/v1alpha1',
  kind: 'Gate',
  metadata: { id: 't.gate', version: '0.1.0' },
  spec: {
    domain: 'L1',
    claims: ['c1'],
    triggers: ['task_close'],
    executors: [{ id: 'e1', type: 'command', command: ['true'], evidenceType: 'x' }],
    evidence: { required: ['x'] },
    policy: { failure: 'block', inconclusive: 'block' },
    ...over,
  },
})

const ev = (over: Partial<Evidence>): Evidence => ({
  id: 'ev1', runId: 'r1', gateId: 't.gate', type: 'x', producer: 'e1',
  result: 'pass', execution: 'exercised', provenance: { startedAt: 1 }, ...over,
})

describe('decision 四态化：CONDITIONAL 必须带执行语义', () => {
  it('executor error + inconclusive:warn → CONDITIONAL/error，而不是「证据不足」', () => {
    const d = decide(gateSpec({ policy: { failure: 'block', inconclusive: 'warn' } }), [ev({ result: 'error' })])
    expect(d.verdict).toBe('CONDITIONAL')
    expect(d.executionStatus).toBe('error')
    expect(d.degradedReason).toBe('executor-error')
  })

  it('缺证据 + inconclusive:warn → CONDITIONAL/skipped（没测，不是仪器坏）', () => {
    const d = decide(gateSpec({ policy: { failure: 'block', inconclusive: 'warn' } }), [])
    expect(d.verdict).toBe('CONDITIONAL')
    expect(d.executionStatus).toBe('skipped')
    expect(d.degradedReason).toBe('insufficient-evidence')
  })

  it('失败被 warn 容忍 → CONDITIONAL/degraded（failure-tolerated）', () => {
    const d = decide(gateSpec({ policy: { failure: 'warn', inconclusive: 'block' } }), [ev({ result: 'fail' })])
    expect(d.verdict).toBe('CONDITIONAL')
    expect(d.executionStatus).toBe('degraded')
    expect(d.degradedReason).toBe('failure-tolerated')
  })

  it('条件证据 → CONDITIONAL/degraded（evidence-conditional）', () => {
    const d = decide(gateSpec(), [ev({ result: 'conditional' })])
    expect(d.verdict).toBe('CONDITIONAL')
    expect(d.executionStatus).toBe('degraded')
    expect(d.degradedReason).toBe('evidence-conditional')
  })

  it('PASS/FAIL/INCONCLUSIVE 是 executed；不把判定本身伪装成 degraded', () => {
    expect(decide(gateSpec(), [ev({})]).executionStatus).toBe('executed')
    expect(decide(gateSpec(), [ev({ result: 'fail' })]).executionStatus).toBe('executed')
    const inconclusive = decide(gateSpec(), [ev({ result: 'error' })])
    expect(inconclusive.verdict).toBe('INCONCLUSIVE')
    expect(inconclusive.executionStatus).toBe('error')
    expect(inconclusive.degradedReason).toBe('executor-error')
  })
})

describe('run 存储：新字段端到端可回读', () => {
  it('saveRun → loadRun 保留 executionStatus/degradedReason', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qgate-health-'))
    try {
      const paths = storePaths(dir)
      const run: GateRun = {
        runId: 'run-1', gateId: 't.gate', gateVersion: '0.1.0', trigger: 'task_close',
        workspace: dir, startedAt: Date.now(), verdict: 'CONDITIONAL',
        conditions: ['executor error accepted under warn policy: x:error'],
        evidenceIds: [], executionStatus: 'error', degradedReason: 'executor-error',
      }
      saveRun(paths, run, [])
      const loaded = loadRun(paths, 'run-1')
      expect(loaded?.executionStatus).toBe('error')
      expect(loaded?.degradedReason).toBe('executor-error')
      expect(parseRun(JSON.parse(JSON.stringify(run)))?.executionStatus).toBe('error')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('旧 run 无 executionStatus：parseRun 不拒收，字段为 undefined', () => {
    const legacy = {
      runId: 'run-old', gateId: 't.gate', gateVersion: '0.1.0', trigger: 'task_close',
      workspace: '/tmp', startedAt: 1, verdict: 'CONDITIONAL', conditions: ['old'], evidenceIds: [],
    }
    const parsed = parseRun(legacy)
    expect(parsed).not.toBeNull()
    expect(parsed?.executionStatus).toBeUndefined()
  })

  it('inputSnapshot 200 文件 + 截断标记（201 键）不被 parseRun 拒收', () => {
    const snap = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`f${i}.ts`, 'h']))
    snap.__qgate_snapshot_truncated__ = '250'
    const run = {
      runId: 'run-trunc', gateId: 't.gate', gateVersion: '0.1.0', trigger: 'task_close',
      workspace: '/tmp', startedAt: 1, verdict: 'PASS', evidenceIds: [], inputSnapshot: snap,
    }
    expect(parseRun(run)).not.toBeNull()
  })
})

describe('health：DEGRADED/SKIP/legacy/连续计数', () => {
  it('error→DEGRADED；insufficient→SKIP；legacy→DEGRADED；PASS→OK', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qgate-health-'))
    try {
      const spec = gateSpec()
      const paths = storePaths(dir)
      const base = { workspace: dir, gateId: spec.metadata.id, gateVersion: '0.1.0', trigger: 'task_close' as const }
      saveRun(paths, { ...base, runId: 'r1', startedAt: 1, verdict: 'CONDITIONAL', conditions: ['x'], evidenceIds: [], executionStatus: 'error', degradedReason: 'executor-error' }, [])
      const r1 = assessHealth({
        gates: [spec], resolved: resolveProfile([spec], undefined, undefined),
        state: latestRuns(paths), runs: listRuns(paths), workspace: dir, scope: 'all', now: 2, maxAgeHours: 24,
      })
      expect(r1.gates[0].health).toBe('degraded')
      expect(r1.gates[0].reason).toBe('executor-error')

      saveRun(paths, { ...base, runId: 'r2', startedAt: 2, verdict: 'CONDITIONAL', conditions: ['x'], evidenceIds: [], executionStatus: 'skipped', degradedReason: 'insufficient-evidence' }, [])
      const r2 = assessHealth({
        gates: [spec], resolved: resolveProfile([spec], undefined, undefined),
        state: latestRuns(paths), runs: listRuns(paths), workspace: dir, scope: 'all', now: 3, maxAgeHours: 24,
      })
      expect(r2.gates[0].health).toBe('skip')

      saveRun(paths, { ...base, runId: 'r3', startedAt: 3, verdict: 'PASS', evidenceIds: [] }, [])
      const r3 = assessHealth({
        gates: [spec], resolved: resolveProfile([spec], undefined, undefined),
        state: latestRuns(paths), runs: listRuns(paths), workspace: dir, scope: 'all', now: 4, maxAgeHours: 24,
      })
      expect(r3.gates[0].health).toBe('ok')
      expect(r3.gates[0].consecutiveNonPass).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('连续非 PASS 计数与阈值触发', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qgate-health-'))
    try {
      const spec = gateSpec()
      const paths = storePaths(dir)
      const base = { workspace: dir, gateId: spec.metadata.id, gateVersion: '0.1.0', trigger: 'task_close' as const }
      saveRun(paths, { ...base, runId: 'r1', startedAt: 1, verdict: 'PASS', evidenceIds: [] }, [])
      saveRun(paths, { ...base, runId: 'r2', startedAt: 2, verdict: 'CONDITIONAL', conditions: ['x'], evidenceIds: [], executionStatus: 'error', degradedReason: 'executor-error' }, [])
      saveRun(paths, { ...base, runId: 'r3', startedAt: 3, verdict: 'CONDITIONAL', conditions: ['x'], evidenceIds: [], executionStatus: 'error', degradedReason: 'executor-error' }, [])
      const report = assessHealth({
        gates: [spec], resolved: resolveProfile([spec], undefined, undefined),
        state: latestRuns(paths), runs: listRuns(paths), workspace: dir, scope: 'all', now: 4, maxAgeHours: 24,
        consecutiveThreshold: 2,
      })
      expect(report.gates[0].consecutiveNonPass).toBe(2)
      expect(report.gates[0].consecutiveBreach).toBe(true)
      expect(report.exitCode).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('health scope：pre-push 只看 L0，release 只看全量测试门', () => {
  const l0 = gateSpec({ domain: 'L0' })
  const l1 = gateSpec({ domain: 'L1' })
  const full: GateSpec = {
    ...gateSpec({ domain: 'L1' }),
    metadata: { id: 'engineering.basic-check', version: '0.1.0-overlay' },
  }
  it('pre-push 只返回 L0', () => {
    expect(gatesForScope([l0, l1, full], 'pre-push').map((g) => g.metadata.id)).toEqual(['t.gate'])
  })
  it('release 只返回 engineering.basic-check（L0 由 pre-push 负责）', () => {
    expect(gatesForScope([l0, l1, full], 'release').map((g) => g.metadata.id)).toEqual(['engineering.basic-check'])
  })
})

describe('scope executor：200 上限与空声明语义', () => {
  const executor: ExecutorSpec = { id: 'scope', type: 'scope', mode: 'scope', evidenceType: 'scope-check-result' }
  const input = (workspace: string, changedPaths: string[]) => ({ runId: 'r1', gateId: 'L0.scope-check', workspace, changedPaths })
  const withScope = (yaml: string, fn: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'qgate-scope-'))
    try {
      mkdirSync(join(dir, '.qgate'), { recursive: true })
      writeFileSync(join(dir, '.qgate', 'scope.yaml'), yaml)
      fn(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const listYaml = (paths: string[]) => `paths:\n${paths.map((p) => `  - ${p}`).join('\n')}\n`

  it('267 条路径不再触发 200 上限（命中 → pass）', () => {
    const paths = Array.from({ length: 267 }, (_, i) => `docs/f${i}/**`)
    withScope(listYaml(paths), (dir) => {
      const ev = runScopeExecutor(executor, input(dir, ['docs/f0/a.ts']))
      expect(ev.result).toBe('pass')
      expect(ev.execution).toBe('exercised')
    })
  })

  it('空数组 → fail（配置错误），不是 error/证据不足', () => {
    withScope('paths: []\n', (dir) => {
      const ev = runScopeExecutor(executor, input(dir, ['x.ts']))
      expect(ev.result).toBe('fail')
      expect(ev.summary).toContain('empty scope')
    })
  })

  it('非数组 → error（输入不可解析，仍是 INCONCLUSIVE 方向）', () => {
    withScope('paths: not-a-list\n', (dir) => {
      const ev = runScopeExecutor(executor, input(dir, ['x.ts']))
      expect(ev.result).toBe('error')
      expect(ev.summary).toContain('array of non-empty strings')
    })
  })

  it('超过 2000 条 → error（显式拒绝无界声明）', () => {
    const paths = Array.from({ length: 2001 }, (_, i) => `docs/f${i}/**`)
    withScope(listYaml(paths), (dir) => {
      const ev = runScopeExecutor(executor, input(dir, ['docs/f0/a.ts']))
      expect(ev.result).toBe('error')
    })
  })
})
