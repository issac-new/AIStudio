// v0.3 R4 运营门族守门：metrics/budget/rerun/trace-continuity/resilience/topology。
// 负例先行：阈值越界、预算不足、输出分叉、断链、演练超时、拓扑单域——都不得 PASS。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runOpsExecutor } from '../src/executors/ops.js'
import type { ExecutorSpec } from '../src/core/types.js'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'qgate-r4-'))
const run = (e: ExecutorSpec, ws: string) => runOpsExecutor(e, { runId: 'r', gateId: 'g', workspace: ws })

describe('ops metrics', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'metrics', evidenceType: 'x', observedFile: 'm.json', thresholds: { p99Ms: { max: 200 }, availability: { min: 0.99 } } }

  it('阈值内 → pass；越界 → fail 点名；指标缺失/非数值 → error', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'm.json'), JSON.stringify({ metrics: { p99Ms: 120, availability: 0.995 } }))
    expect(run(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'm.json'), JSON.stringify({ metrics: { p99Ms: 250, availability: 0.995 } }))
    const fail = run(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('p99Ms=250 > max 200')
    writeFileSync(join(ws, 'm.json'), JSON.stringify({ metrics: { p99Ms: 120 } }))
    expect(run(exec, ws).result).toBe('error')
    rmSync(join(ws, 'm.json'))
    expect(run(exec, ws).result).toBe('error')
  })
})

describe('ops budget', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'budget', evidenceType: 'x', dataFile: 'b.json' }

  it('预算充足 → pass；不足 → fail budgetExceeded；重试超 20% → fail retryBudgetExceeded', () => {
    const ws = tmp()
    // Σtimeout=1000，retry 开销 100（10% < 20%）；gateway 需 200+200+700=1100 ≤ 1500
    writeFileSync(join(ws, 'b.json'), JSON.stringify({
      hops: [
        { caller: 'gateway', callee: 'orders', timeoutMs: 100, retries: 1 },
        { caller: 'gateway', callee: 'pay', timeoutMs: 200, retries: 0 },
        { caller: 'gateway', callee: 'search', timeoutMs: 700, retries: 0 },
      ],
      budgets: { gateway: 1500 },
    }))
    expect(run(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'b.json'), JSON.stringify({
      hops: [{ caller: 'gateway', callee: 'orders', timeoutMs: 1000, retries: 2 }],
      budgets: { gateway: 100 },
    }))
    const fail = run(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('budgetExceeded')
    writeFileSync(join(ws, 'b.json'), JSON.stringify({
      hops: [{ caller: 'gateway', callee: 'orders', timeoutMs: 100, retries: 9 }],
      budgets: { gateway: 100000 },
    }))
    const retry = run(exec, ws)
    expect(retry.result).toBe('fail')
    expect(retry.summary).toContain('retryBudgetExceeded')
  })

  it('缺 caller 预算 → fail missingCallerBudget；retries>10 → error', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'b.json'), JSON.stringify({
      hops: [{ caller: 'gw', callee: 'a', timeoutMs: 100, retries: 0 }],
      budgets: { other: 1 },
    }))
    const miss = run(exec, ws)
    expect(miss.result).toBe('fail')
    expect(miss.summary).toContain('missingCallerBudget')
    writeFileSync(join(ws, 'b.json'), JSON.stringify({
      hops: [{ caller: 'gw', callee: 'a', timeoutMs: 100, retries: 11 }],
      budgets: { gw: 99999 },
    }))
    expect(run(exec, ws).result).toBe('error')
  })
})

describe('ops rerun（幂等重跑证据）', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'rerun', evidenceType: 'x', dataFile: 'r.json' }

  it('同 seed 双跑同哈希 → pass；输出分叉 → fail outputDivergence；复式不平 → fail', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'r.json'), JSON.stringify({
      jobs: [{ id: 'settle', seed: 7, idempotencyKeyStrategy: 'orderNo+action', runs: [{ sha256: 'aa' }, { sha256: 'aa' }], doubleEntry: { debit: 100, credit: 100 } }],
    }))
    expect(run(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'r.json'), JSON.stringify({
      jobs: [{ id: 'settle', seed: 7, idempotencyKeyStrategy: 'k', runs: [{ sha256: 'aa' }, { sha256: 'bb' }] }],
    }))
    const div = run(exec, ws)
    expect(div.result).toBe('fail')
    expect(div.summary).toContain('outputDivergence')
    writeFileSync(join(ws, 'r.json'), JSON.stringify({
      jobs: [{ id: 'settle', seed: 7, idempotencyKeyStrategy: 'k', runs: [{ sha256: 'aa' }, { sha256: 'aa' }], doubleEntry: { debit: 100, credit: 90 } }],
    }))
    expect(run(exec, ws).summary).toContain('unbalancedDoubleEntry')
  })

  it('单次运行/异 seed/无策略 → error', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'r.json'), JSON.stringify({ jobs: [{ id: 'j', seed: 1, idempotencyKeyStrategy: 'k', runs: [{ sha256: 'a' }] }] }))
    expect(run(exec, ws).result).toBe('error')
    writeFileSync(join(ws, 'r.json'), JSON.stringify({ jobs: [{ id: 'j', seed: 1, runs: [] }] }))
    expect(run(exec, ws).result).toBe('error')
  })
})

describe('ops trace-continuity', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'trace-continuity', evidenceType: 'x', observedFile: 't.json', pairs: [['gateway', 'orders']] }

  it('连续 → pass；traceId 断 → fail；parentSpanId 错 → fail；缺链 → fail', () => {
    const ws = tmp()
    const ok = {
      links: [{
        caller: 'gateway', callee: 'orders',
        callerSpan: { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) },
        calleeSpan: { traceId: 'a'.repeat(32), spanId: 'c'.repeat(16), parentSpanId: 'b'.repeat(16) },
        traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
      }],
    }
    writeFileSync(join(ws, 't.json'), JSON.stringify(ok))
    expect(run(exec, ws).result).toBe('pass')
    const broken = JSON.parse(JSON.stringify(ok))
    broken.links[0].calleeSpan.traceId = 'd'.repeat(32)
    writeFileSync(join(ws, 't.json'), JSON.stringify(broken))
    expect(run(exec, ws).summary).toContain('trace-id-discontinuity')
    const badParent = JSON.parse(JSON.stringify(ok))
    badParent.links[0].calleeSpan.parentSpanId = 'e'.repeat(16)
    writeFileSync(join(ws, 't.json'), JSON.stringify(badParent))
    expect(run(exec, ws).summary).toContain('span-id-mismatch')
    writeFileSync(join(ws, 't.json'), JSON.stringify({ links: [] }))
    expect(run(exec, ws).summary).toContain('missing-link')
  })

  it('traceparent 非 W3C → fail', () => {
    const ws = tmp()
    writeFileSync(join(ws, 't.json'), JSON.stringify({
      links: [{
        caller: 'gateway', callee: 'orders',
        callerSpan: { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) },
        calleeSpan: { traceId: 'a'.repeat(32), spanId: 'c'.repeat(16), parentSpanId: 'b'.repeat(16) },
        traceparent: 'garbage',
      }],
    }))
    expect(run(exec, ws).summary).toContain('traceparent-format')
  })
})

describe('ops resilience', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'resilience', evidenceType: 'x', observedFile: 'd.json', maxRecoveryMs: 5000, maxAgeDays: 7 }

  it('预算内+信号齐 → pass；超时/缺信号/演练过期 → fail', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'd.json'), JSON.stringify({
      drills: [{ fault: 'db-down', recoveryMs: 3000, finalState: 'degraded-ok', observedAt: new Date().toISOString(), signals: { log: true, metric: true, trace: true, alert: true } }],
    }))
    expect(run(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'd.json'), JSON.stringify({
      drills: [
        { fault: 'db-down', recoveryMs: 9000, finalState: 'x', observedAt: new Date().toISOString(), signals: { log: true, metric: true, trace: true, alert: true } },
        { fault: 'redis-down', recoveryMs: 100, finalState: 'x', observedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(), signals: { log: true } },
      ],
    }))
    const fail = run(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('recovery 9000ms > max 5000ms')
    expect(fail.summary).toContain('stale')
    expect(fail.summary).toContain('signal metric missing')
  })
})

describe('ops topology（R1-R4）', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'topology', evidenceType: 'x', dataFile: 'topo.json' }
  const good = {
    services: [
      { id: 'gateway', replicas: 2, stateModel: 'stateless', failureDomain: { region: 'cn', zone: 'a' } },
      { id: 'orders', replicas: 3, stateModel: 'consensus', failureDomain: { region: 'cn', zone: 'b' }, roles: ['follower'] },
      { id: 'ledger', replicas: 3, stateModel: 'consensus', failureDomain: { region: 'us', zone: 'c' }, roles: ['leader'], transientLeadership: true, leaderLeaseSec: 15 },
    ],
    critical: ['orders'],
    dependencies: [{ from: 'gateway', to: 'orders' }, { from: 'gateway', to: 'ledger' }],
  }

  it('R1-R4 全过 → pass；共识偶数副本 → fail R2；leader 缺租约 → fail R4；单域 → fail R1', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'topo.json'), JSON.stringify(good))
    expect(run(exec, ws).result).toBe('pass')
    const even = JSON.parse(JSON.stringify(good))
    even.services[1].replicas = 4
    writeFileSync(join(ws, 'topo.json'), JSON.stringify(even))
    expect(run(exec, ws).summary).toContain('must be odd')
    const noLease = JSON.parse(JSON.stringify(good))
    delete noLease.services[2].leaderLeaseSec
    writeFileSync(join(ws, 'topo.json'), JSON.stringify(noLease))
    expect(run(exec, ws).summary).toContain('R4')
    const oneDomain = JSON.parse(JSON.stringify(good))
    for (const s of oneDomain.services) s.failureDomain = { region: 'cn', zone: 'a' }
    writeFileSync(join(ws, 'topo.json'), JSON.stringify(oneDomain))
    expect(run(exec, ws).summary).toContain('R1')
  })

  it('无域信息未显式声明 → fail R1；显式 domainVerification:unavailable → 降级放行', () => {
    const ws = tmp()
    const noDomain = JSON.parse(JSON.stringify(good))
    for (const s of noDomain.services) delete s.failureDomain
    writeFileSync(join(ws, 'topo.json'), JSON.stringify(noDomain))
    expect(run(exec, ws).summary).toContain('domainVerification')
    noDomain.domainVerification = 'unavailable'
    writeFileSync(join(ws, 'topo.json'), JSON.stringify(noDomain))
    expect(run(exec, ws).result).toBe('pass')
  })
})
