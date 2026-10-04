// gov-metrics 域单测（P6b）：三可算指标的口径与边界、纯计算不 IO。
import { describe, expect, it } from 'vitest'
import { computeGovernanceMetrics, type EventRow, type ApprovalRow } from '../gov-metrics'

const NOW = Date.now()
const ev = (runId: string, kind: string, ts = NOW - 1000): EventRow => ({ runId, kind, ts })
const ap = (ts: number, actor: string, decision: string): ApprovalRow => ({ ts, actor, decision })

describe('P6b 路由违约率（代理口径）', () => {
  it('违约/(违约+node.completed)；零事件分母如实 null', () => {
    const r = computeGovernanceMetrics(
      [ev('r1', 'node.completed'), ev('r1', 'node.completed'), ev('r1', 'node.completed'), ev('r1', 'node.completed'), ev('r1', 'node.completed'), ev('r1', 'node.completed'), ev('r1', 'node.completed'), ev('r1', 'node.completed'), ev('r1', 'edge.guard-exceeded')],
      [], 7 * 86400000,
    )
    expect(r.routeViolationRate.value).toBeCloseTo(1 / 9)
    expect(r.routeViolationRate.numerator).toBe(1)
    expect(r.routeViolationRate.denominator).toBe(9)
    const empty = computeGovernanceMetrics([], [], 7 * 86400000)
    expect(empty.routeViolationRate.value).toBeNull()
    expect(empty.routeViolationRate.note).toContain('分母为 0')
  })

  it('error-routed 也计入违约分子', () => {
    const r = computeGovernanceMetrics([ev('r1', 'node.completed'), ev('r1', 'node.error-routed')], [], 7 * 86400000)
    expect(r.routeViolationRate.numerator).toBe(1)
    expect(r.routeViolationRate.value).toBeCloseTo(1 / 2)
  })

  it('窗口外事件不计', () => {
    const r = computeGovernanceMetrics([ev('r1', 'edge.guard-exceeded', NOW - 30 * 86400000)], [], 7 * 86400000)
    expect(r.routeViolationRate.denominator).toBe(0)
  })
})

describe('P6b 恢复成功率（中断 run 终态）', () => {
  it('中断后 completed 计成功；failed 计失败；在途不计分母', () => {
    const events = [
      ev('a', 'interrupt.raised'), ev('a', 'run.completed'),
      ev('b', 'interrupt.raised'), ev('b', 'run.failed'),
      ev('c', 'interrupt.raised'), // 在途
      ev('d', 'run.completed'),    // 无中断，不进分母
    ]
    const r = computeGovernanceMetrics(events, [], 7 * 86400000)
    expect(r.recoverySuccessRate.numerator).toBe(1)
    expect(r.recoverySuccessRate.denominator).toBe(2)
    expect(r.recoverySuccessRate.value).toBeCloseTo(0.5)
    expect(r.recoverySuccessRate.note).toContain('在途')
  })

  it('run 先 completed 后 failed：终态取最后（如实）', () => {
    const events = [ev('x', 'interrupt.raised'), ev('x', 'run.completed'), ev('x', 'run.failed')]
    const r = computeGovernanceMetrics(events, [], 7 * 86400000)
    expect(r.recoverySuccessRate.numerator).toBe(0)
    expect(r.recoverySuccessRate.denominator).toBe(1)
  })
})

describe('P6b 人工接管率（审批台账代理）', () => {
  it('human/(human+auto_pass)；代理偏差在注记如实标注', () => {
    const approvals = [
      ap(NOW - 1000, 'admin', 'once'),
      ap(NOW - 2000, 'admin', 'deny'),
      ap(NOW - 3000, 'system', 'auto_pass'),
      ap(NOW - 4000, 'system', 'auto_pass'),
      ap(NOW - 5000, 'system', 'auto_pass'),
    ]
    const r = computeGovernanceMetrics([], approvals, 7 * 86400000)
    expect(r.humanTakeoverRate.value).toBeCloseTo(2 / 5)
    expect(r.humanTakeoverRate.note).toContain('代理偏差')
  })

  it('台账空→null；窗口外不计', () => {
    expect(computeGovernanceMetrics([], [], 7 * 86400000).humanTakeoverRate.value).toBeNull()
    const r = computeGovernanceMetrics([], [ap(NOW - 30 * 86400000, 'a', 'once')], 7 * 86400000)
    expect(r.humanTakeoverRate.denominator).toBe(0)
  })
})

describe('P6b 仍 gap 的两指标：采集点缺口如实说明', () => {
  it('duplicateSideEffect/budgetStop 给出具体缺口（不造数不空话）', () => {
    const r = computeGovernanceMetrics([], [], 7 * 86400000)
    expect(r.duplicateSideEffectRate.gapReason).toContain('拒绝账')
    expect(r.budgetStopAccuracy.gapReason).toContain('budget.stop')
  })
})
