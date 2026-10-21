// callgate 守门：熔断三态转移 / 滑窗限流 / 准入次序 / 降级阶梯 / 重试互斥 /
// 注册表端到端（check→settle 闭环）。时钟注入=确定性断言。
import { describe, expect, it } from 'vitest'
import {
  CallgateRegistry, admit, beginHalfOpenProbe, breakerAllows, degradeActionFor,
  initialBreaker, recordFailure, recordSuccess, resourceId, retryPermitted, tryAcquire,
  type BreakerRule, type CallgateRule,
} from '../callgate'

const RULE: BreakerRule = { failureThreshold: 3, windowMs: 60_000, openMs: 30_000, halfOpenProbes: 1 }

const llmRule: CallgateRule = {
  resource: { kind: 'llm', key: 'glm-5.3' },
  quota: { maxConcurrent: 2, maxPerMinute: 5 },
  breaker: RULE,
}

describe('熔断器三态', () => {
  it('CLOSED 窗口内失败达阈值 → OPEN；OPEN 冷却未满不放行', () => {
    let b = initialBreaker()
    b = recordFailure(b, RULE, 1_000)
    b = recordFailure(b, RULE, 2_000)
    expect(b.state).toBe('closed')
    b = recordFailure(b, RULE, 3_000)
    expect(b.state).toBe('open')
    expect(breakerAllows(b, RULE, 10_000)).toBe(false)
  })

  it('冷却期满 → HALF_OPEN 只放一个探测；探测成功收敛 CLOSED、失败回 OPEN', () => {
    let b = recordFailure(recordFailure(recordFailure(initialBreaker(), RULE, 1_000), RULE, 2_000), RULE, 3_000)
    expect(b.state).toBe('open')
    expect(breakerAllows(b, RULE, 33_001)).toBe(true) // openAt=3000+openMs=30000
    b = { ...b, state: 'half-open' }
    expect(breakerAllows(b, RULE, 33_001)).toBe(true)
    const probing = beginHalfOpenProbe(b)
    expect(breakerAllows(probing, RULE, 33_002)).toBe(false) // 第二个并发探测拒绝
    expect(recordSuccess(probing).state).toBe('closed')
    const failed = recordFailure(b, RULE, 34_000)
    expect(failed.state).toBe('open')
    expect(failed.openedAt).toBe(34_000)
  })

  it('窗口外失败滑出不计阈值；OPEN 期间迟到失败不重复触发', () => {
    let b = recordFailure(initialBreaker(), RULE, 0)
    b = recordFailure(b, RULE, 61_000) // 第一条已滑出窗口
    b = recordFailure(b, RULE, 62_000)
    expect(b.state).toBe('closed')
    const open = recordFailure(recordFailure(recordFailure(initialBreaker(), RULE, 1_000), RULE, 2_000), RULE, 3_000)
    expect(recordFailure(open, RULE, 4_000)).toBe(open)
  })
})

describe('滑动窗口限流', () => {
  it('窗口内配额满 → 拒绝并给出 retryAfter；滑出后恢复', () => {
    const quota = { maxConcurrent: 10, maxPerMinute: 3 }
    let granted: number[] = []
    for (const now of [1_000, 2_000, 3_000]) {
      const r = tryAcquire(granted, quota, now)
      expect(r.verdict.allowed).toBe(true)
      granted = r.granted
    }
    const blocked = tryAcquire(granted, quota, 4_000)
    expect(blocked.verdict.allowed).toBe(false)
    expect(blocked.verdict.usedPerMinute).toBe(3)
    expect(blocked.verdict.retryAfterMs).toBe(57_000) // 60s - (4000-1000)
    const recovered = tryAcquire(granted, quota, 61_001)
    expect(recovered.verdict.allowed).toBe(true)
  })
})

describe('admit 准入次序：熔断 > 速率 > 并发（排队兜底）', () => {
  it('OPEN 期间连限流都不看，直接 breaker_open', () => {
    const breaker = recordFailure(recordFailure(recordFailure(initialBreaker(), RULE, 1_000), RULE, 2_000), RULE, 3_000)
    const d = admit({ rule: llmRule, breaker, granted: [], inFlight: 0, queueDepth: 0, now: 5_000 })
    expect(d.verdict).toBe('breaker_open')
  })

  it('速率超窗 → rate_limited；并发满且队列有位 → queued；队列也满 → concurrency_full', () => {
    const d = admit({ rule: llmRule, breaker: initialBreaker(), granted: [1_000, 2_000, 3_000, 4_000, 5_000], inFlight: 0, queueDepth: 0, now: 6_000 })
    expect(d.verdict).toBe('rate_limited')
    const d2 = admit({ rule: llmRule, breaker: initialBreaker(), granted: [], inFlight: 2, queueDepth: 0, now: 6_000 })
    expect(d2.verdict).toBe('queued')
    const d3 = admit({ rule: llmRule, breaker: initialBreaker(), granted: [], inFlight: 2, queueDepth: 2, now: 6_000 })
    expect(d3.verdict).toBe('concurrency_full')
    const d4 = admit({ rule: llmRule, breaker: initialBreaker(), granted: [], inFlight: 1, queueDepth: 0, now: 6_000 })
    expect(d4.verdict).toBe('allow')
  })
})

describe('降级阶梯与重试互斥', () => {
  it('降级映射：llm 熔断切备模、mcp 熔断降工具、并发满拒绝、排队超时转人工', () => {
    expect(degradeActionFor('breaker_open', 'llm')).toBe('degrade_model')
    expect(degradeActionFor('breaker_open', 'mcp')).toBe('degrade_tools')
    expect(degradeActionFor('rate_limited', 'mcp')).toBe('queue')
    expect(degradeActionFor('concurrency_full', 'llm')).toBe('reject')
    expect(degradeActionFor('queue_timeout', 'llm')).toBe('handoff_human')
    expect(degradeActionFor('allow', 'llm')).toBe('none')
  })

  it('互斥：OPEN 禁重试；HALF_OPEN 只放首次探测；CLOSED 按策略', () => {
    const open = recordFailure(recordFailure(recordFailure(initialBreaker(), RULE, 1_000), RULE, 2_000), RULE, 3_000)
    expect(retryPermitted(open, RULE, 1, 3, 5_000)).toBe(false)
    const half = { ...open, state: 'half-open' as const }
    expect(retryPermitted(half, RULE, 1, 3, 33_001)).toBe(true)
    expect(retryPermitted(half, RULE, 2, 3, 33_001)).toBe(false)
    expect(retryPermitted(initialBreaker(), RULE, 2, 3, 5_000)).toBe(true)
    expect(retryPermitted(initialBreaker(), RULE, 4, 3, 5_000)).toBe(false) // 超出策略上限
  })
})

describe('CallgateRegistry 端到端', () => {
  it('check→settle 闭环：连续失败熔断、冷却后半开探测、成功恢复', () => {
    let t = 0
    const reg = new CallgateRegistry({ now: () => t })
    reg.setRule(llmRule)
    const res = llmRule.resource
    expect(reg.check(res).verdict).toBe('allow')
    reg.settle(res, false)
    reg.settle(res, false)
    expect(reg.status(res).breaker.state).toBe('closed')
    reg.settle(res, false)
    expect(reg.status(res).breaker.state).toBe('open')
    expect(reg.check(res).verdict).toBe('breaker_open')
    t = 40_000 // 冷却期满（openedAt=0 + 30s）
    const probe = reg.check(res)
    expect(probe.verdict).toBe('allow')
    expect(reg.status(res).breaker.state).toBe('half-open')
    // 半开态只放 1 个探测：探测在途时第二个请求被熔断面拒绝
    expect(reg.check(res).verdict).toBe('breaker_open')
    expect(reg.status(res).inFlight).toBe(1)
    reg.settle(res, true)
    expect(reg.status(res).breaker.state).toBe('closed')
    expect(reg.check(res).verdict).toBe('allow')
    expect(reg.status(res).inFlight).toBe(1)
    reg.settle(res, true)
    expect(reg.status(res).inFlight).toBe(0)
    expect(reg.listStatuses().some((s) => s.resource === resourceId(res))).toBe(true)
  })

  it('未登记资源走缺省规则 fail-open；速率面在注册表内也生效', () => {
    let t = 1_000
    const reg = new CallgateRegistry({ now: () => t })
    const res = { kind: 'mcp' as const, key: 'unknown-server' }
    expect(reg.check(res).verdict).toBe('allow') // 缺省并发 4
    reg.check(res); reg.check(res); reg.check(res)
    expect(reg.check(res).verdict).toBe('queued') // 第 5 个进队列
  })
})
