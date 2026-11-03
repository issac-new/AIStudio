// 派单准入（DeerFlow capacity 吸收）测试：未配置不拦、有余量放行、饱和拒绝、排队超时。
import { describe, it, expect } from 'vitest'
import { admitDispatch, capacityFromEnv } from '../dispatch-capacity'
import { DISPATCH_REASON_CODES } from '../dispatch-reasons'
import { planDispatch, type PlanFacts } from '../mention-dispatch'

describe('admitDispatch', () => {
  it('未配置上限（0/负数/NaN）→ 放行（存量行为不变）', () => {
    expect(admitDispatch({ runningTotal: 99, maxRunning: 0 }).action).toBe('start')
    expect(admitDispatch({ runningTotal: 99, maxRunning: -3 }).action).toBe('start')
    expect(admitDispatch({ runningTotal: 0, maxRunning: Number.NaN }).action).toBe('start')
  })

  it('有余量放行；恰好饱和按 reject 策略拒绝并给具名理由', () => {
    expect(admitDispatch({ runningTotal: 2, maxRunning: 3 }).action).toBe('start')
    const full = admitDispatch({ runningTotal: 3, maxRunning: 3 })
    expect(full.action).toBe('reject')
    expect(full.reason).toBe('capacity_exhausted')
    expect(full.detail).toContain('3/3')
  })

  it('queue 策略：未到截止排队；到截止判超时拒绝', () => {
    const queued = admitDispatch({ runningTotal: 2, maxRunning: 2, policy: 'queue', queueTimeoutMs: 60_000, waitedMs: 5_000 })
    expect(queued.action).toBe('queue')
    expect(queued.detail).toContain('排队')

    const timedOut = admitDispatch({ runningTotal: 2, maxRunning: 2, policy: 'queue', queueTimeoutMs: 60_000, waitedMs: 60_000 })
    expect(timedOut.action).toBe('reject')
    expect(timedOut.reason).toBe('capacity_timeout')
  })

  it('非法 runningTotal（NaN/负）按 0 处理，不因脏事实误拒', () => {
    expect(admitDispatch({ runningTotal: Number.NaN, maxRunning: 1 }).action).toBe('start')
    expect(admitDispatch({ runningTotal: -5, maxRunning: 1 }).action).toBe('start')
  })
})

describe('capacityFromEnv', () => {
  it('缺省策略 reject、超时 0；queue 策略可显式开启', () => {
    const d = capacityFromEnv({}, 2)
    expect(d.maxRunning).toBe(0)
    expect(d.policy).toBe('reject')
    expect(d.queueTimeoutMs).toBe(0)
    expect(admitDispatch(d).action).toBe('start')

    const q = capacityFromEnv({ ZCODE_MAX_CONCURRENT_RUNS: '2', ZCODE_CAPACITY_POLICY: 'queue', ZCODE_CAPACITY_QUEUE_TIMEOUT_MS: '30000' }, 2)
    expect(q.maxRunning).toBe(2)
    expect(q.policy).toBe('queue')
    expect(q.queueTimeoutMs).toBe(30_000)
    expect(admitDispatch(q).action).toBe('queue')
  })
})

describe('reason 码表（只追加纪律）', () => {
  it('新增 capacity_* 与既有码表共存，未改名未删旧码', () => {
    expect(DISPATCH_REASON_CODES).toContain('capacity_exhausted')
    expect(DISPATCH_REASON_CODES).toContain('capacity_timeout')
    // 旧码仍在（冻结纪律：只追加）
    for (const legacy of ['queued', 'coalesced', 'deferred', 'already_active', 'runtime_offline']) {
      expect(DISPATCH_REASON_CODES).toContain(legacy)
    }
  })
})

describe('planDispatch 接入（判定序末位）', () => {
  const baseFacts = (capacity?: PlanFacts['capacity']): PlanFacts => ({
    knownAgents: new Set(['zcode']),
    deferredAgents: new Set(),
    pendingSince: new Map(),
    pendingTtlMs: 30 * 60_000,
    now: 1_000_000,
    ...(capacity ? { capacity } : {}),
  })
  const req = { token: { target: 'zcode', kind: 'agent' as const }, workspacePath: '/w', engineOnline: true }

  it('无 capacity 事实 → 行为不变（queued 起跑）', () => {
    const plan = planDispatch(req, baseFacts())
    expect(plan.action).toBe('start')
    expect(plan.reason).toBe('queued')
  })

  it('有余量 → 起跑；饱和且 reject → capacity_exhausted', () => {
    expect(planDispatch(req, baseFacts({ runningTotal: 1, maxRunning: 2 })).reason).toBe('queued')
    const full = planDispatch(req, baseFacts({ runningTotal: 2, maxRunning: 2 }))
    expect(full.action).toBe('reject')
    expect(full.reason).toBe('capacity_exhausted')
  })

  it('饱和且 queue 策略 → 暂缓（deferred），不硬拒也不起跑', () => {
    const plan = planDispatch(req, baseFacts({ runningTotal: 2, maxRunning: 2, policy: 'queue', queueTimeoutMs: 60_000, waitedMs: 0 }))
    expect(plan.action).toBe('reject')
    expect(plan.reason).toBe('deferred')
    expect(plan.detail).toContain('排队')
  })
})
