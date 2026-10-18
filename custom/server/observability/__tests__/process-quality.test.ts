// 过程质量指标（残余项③）守门：代理口径、空数据不造数、qgate 符合率分母。
import { describe, expect, it } from 'vitest'
import { buildProcessQuality } from '../process-quality'
import type { ToolExecAuditEntry } from '../../toolpipeline/tool-hooks'
import type { QgateRunRow } from '../../expcandidates/qgate-ingest'

const pre = (runId: string, duplicate = false): ToolExecAuditEntry => ({
  ts: 1, phase: 'pre', tool: 'read_file', runId, duplicate,
})
const post = (runId: string, ok: boolean): ToolExecAuditEntry => ({
  ts: 2, phase: 'post', tool: 'read_file', runId, ok,
})
const gate = (verdict: string): QgateRunRow => ({
  runId: `g-${verdict}`, gateId: 'L1.symbol-grounding', verdict, startedAt: 1,
})

describe('buildProcessQuality', () => {
  it('按 run 聚合调用/失败，重复率与长链率用真实分母', () => {
    const r = buildProcessQuality({
      days: 7,
      longChainSteps: 1,
      auditEntries: [
        pre('r1'), pre('r1', true), post('r1', false),
        pre('r2'), post('r2', true),
      ],
      qgateRuns: [gate('PASS'), gate('FAIL'), gate('CONDITIONAL'), gate('WAIVED')],
    })
    expect(r.metrics.runs).toBe(2)
    expect(r.metrics.toolCalls).toBe(3)
    expect(r.metrics.failedCalls).toBe(1)
    expect(r.metrics.duplicateCallRate).toBeCloseTo(1 / 3, 4)
    expect(r.metrics.toolFailureRate).toBeCloseTo(1 / 2, 4)
    expect(r.metrics.longChainRate).toBeCloseTo(1 / 2, 4)
    expect(r.metrics.firstPassSuccessRate).toBeCloseTo(1 / 2, 4)
    expect(r.metrics.specComplianceRate).toBeCloseTo(1 / 3, 4)
    expect(r.qgate).toEqual({ total: 4, pass: 1, fail: 1, conditional: 1, other: 1 })
    expect(r.steps).toEqual({ p50: 1, p95: 2, max: 2 })
  })

  it('无数据时比率为 null，不造数', () => {
    const r = buildProcessQuality({ days: 7, auditEntries: [], qgateRuns: [] })
    expect(r.metrics.runs).toBe(0)
    expect(r.metrics.duplicateCallRate).toBeNull()
    expect(r.metrics.toolFailureRate).toBeNull()
    expect(r.metrics.longChainRate).toBeNull()
    expect(r.metrics.firstPassSuccessRate).toBeNull()
    expect(r.metrics.specComplianceRate).toBeNull()
    expect(r.steps).toEqual({ p50: null, p95: null, max: null })
  })

  it('qgate 分母不含 WAIVED/N/A', () => {
    const r = buildProcessQuality({
      days: 7,
      auditEntries: [],
      qgateRuns: [gate('WAIVED'), gate('NOT_APPLICABLE'), gate('PASS'), gate('PASS')],
    })
    expect(r.metrics.specComplianceRate).toBe(1)
    expect(r.qgate.other).toBe(2)
  })
})
