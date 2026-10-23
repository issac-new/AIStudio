// overlay[eval] 京东吸收轮·立项批单测（2026-10-23）。
//
// 锁定四件事：
//   1. 行为信号面：真实使用遥测 → 信号行（样本不足如实降级、零使用全行 insufficient）；
//   2. 经营语言摘要：verdict 三态裁决规则（红线>门禁>统计纪律>判定端离线）；
//   3. 事实行合成：质量/成本/归因/稳定性行的缺席语义（无数据不造句）；
//   4. 归因行优先级：byRole 最低桶优先，无角色标注回落最弱链路环节。
import { describe, it, expect } from 'vitest'
import { buildBehaviorSignals, MIN_SAMPLES } from '../index'
import { businessSummaryOf } from '../business-summary'
import type { ObsSignalsTotals } from '../../obssignals/signals'
import type { EvalRun, RunAggregates } from '../types'

// ---------- 1. 行为信号面 ----------

function totalsOf(over: Partial<ObsSignalsTotals>): ObsSignalsTotals {
  return {
    day: '2026-10-23',
    sessions: 0,
    llmCalls: 0,
    llmErrors: 0,
    rateLimit429: 0,
    toolCalls: 0,
    toolFailures: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
    ttftMs: { p50: null, p95: null, samples: 0 },
    llmDurationMs: { p50: null, p95: null },
    llmErrorRate: null,
    toolFailureRate: null,
    rateLimit429Rate: null,
    cacheHitRate: null,
    ...over,
  }
}

describe('buildBehaviorSignals（行为数据当评测信号）', () => {
  it('真实使用足量：六信号全出，读数与样本量如实', () => {
    const view = buildBehaviorSignals(totalsOf({
      sessions: 12, llmCalls: 200, llmErrors: 4, toolCalls: 150, toolFailures: 3,
      llmErrorRate: 4 / 204, toolFailureRate: 0.02, rateLimit429Rate: 0, cacheHitRate: 0.6,
    }), 7)
    expect(view.hasUsage).toBe(true)
    expect(view.rows.map((r) => r.key)).toEqual([
      'llm_error_rate', 'tool_failure_rate', 'rate_429', 'cache_hit_rate', 'active_sessions', 'usage_volume',
    ])
    expect(view.rows.every((r) => r.sufficient)).toBe(true)
    expect(view.rows.every((r) => r.onDrift.length > 0)).toBe(true)
  })

  it('样本不足如实降级：低于最小样本量的信号不供消费', () => {
    const view = buildBehaviorSignals(totalsOf({ llmCalls: 5, llmErrors: 1 }), 7)
    const err = view.rows.find((r) => r.key === 'llm_error_rate')!
    expect(err.samples).toBe(6)
    expect(err.sufficient).toBe(false) // 6 < MIN_SAMPLES.llm
    expect(view.hasUsage).toBe(true)
  })

  it('零使用窗口：hasUsage=false（无感投票不存在，结论以离线集为准）', () => {
    const view = buildBehaviorSignals(totalsOf({}), 7)
    expect(view.hasUsage).toBe(false)
    expect(view.rows.every((r) => !r.sufficient)).toBe(true)
    expect(MIN_SAMPLES.llm).toBeGreaterThanOrEqual(10)
  })
})

// ---------- 2/3/4. 经营语言摘要 ----------

function runOf(agg: Partial<RunAggregates>, k = 2): Pick<EvalRun, 'k' | 'aggregates'> {
  return { k, aggregates: { taskCount: 4, passAt1: null, passAtK: null, byLayer: { result: null, trajectory: null, risk: 'none', efficiency: { avgTokens: null, avgCostUsd: null, avgSteps: null, avgDurationMs: null } }, unknownRatio: 0, rubricDrilldownHint: false, riskVeto: false, statisticallyInsufficient: false, judgeOnline: true, ...agg } }
}

describe('businessSummaryOf（评测结果翻译成经营语言）', () => {
  it('红线触发 → blocked（先修安全）', () => {
    const s = businessSummaryOf(runOf({ riskVeto: true }))
    expect(s.verdict).toBe('blocked')
    expect(s.verdictKey).toBe('risk_veto')
  })

  it('门禁 fail → blocked；单跑 k<2 → insufficient（统计纪律优先于通过）', () => {
    expect(businessSummaryOf(runOf({ releaseGate: { verdict: 'fail' } as never })).verdict).toBe('blocked')
    const s = businessSummaryOf(runOf({ passAt1: 1 }, 1))
    expect(s.verdict).toBe('insufficient')
    expect(s.verdictKey).toBe('single_run')
  })

  it('判定端离线 → insufficient（判词不可信不作发布结论）', () => {
    const s = businessSummaryOf(runOf({ judgeOnline: false }))
    expect(s.verdict).toBe('insufficient')
    expect(s.verdictKey).toBe('judge_offline')
  })

  it('全过 → releasable；事实行含质量/成本/耗时', () => {
    const s = businessSummaryOf(runOf({
      passAt1: 0.75,
      byLayer: { result: null, trajectory: null, risk: 'clean', efficiency: { avgTokens: null, avgCostUsd: 0.0123, avgSteps: null, avgDurationMs: 90000 } },
    }))
    expect(s.verdict).toBe('releasable')
    const keys = s.facts.map((f) => f.key)
    expect(keys).toContain('quality')
    expect(keys).toContain('cost')
    expect(keys).toContain('duration')
    const q = s.facts.find((f) => f.key === 'quality')!
    expect(q.params.pass).toBe(75)
  })

  it('归因行：byRole 最低桶优先（失败直达责任方）；无角色回落最弱环节', () => {
    const withRole = businessSummaryOf(runOf({ passAt1: 0.5, byRole: [{ role: 'implementer', taskCount: 2, passed: 0, passAtK: 0 }, { role: 'reviewer', taskCount: 2, passed: 2, passAtK: 1 }] }))
    expect(withRole.facts.find((f) => f.key === 'attribution_role')?.params).toMatchObject({ role: 'implementer', failed: 2, total: 2 })

    const withLink = businessSummaryOf(runOf({ passAt1: 0.5, byLink: { params: { total: 4, passed: 1, unknown: 0, passRate: 0.25 }, intent: { total: 4, passed: 3, unknown: 0, passRate: 0.75 } } }))
    expect(withLink.facts.find((f) => f.key === 'attribution_link')?.params).toMatchObject({ link: 'params', passPct: 25 })
  })

  it('读数缺席不造句：无成本/无稳定性时事实行如实不含', () => {
    const s = businessSummaryOf(runOf({ passAt1: 1 }))
    expect(s.facts.map((f) => f.key)).not.toContain('cost')
    expect(s.facts.map((f) => f.key)).not.toContain('stability')
  })
})
