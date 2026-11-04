// W2 看板详情结果协议投影：纯函数派生 + fail-soft（源不足 null 不猜）。
import { describe, expect, it } from 'vitest'
import { deriveResultContract } from '../kanban-task-fast'

describe('deriveResultContract（W2 读侧投影）', () => {
  it('无 summary 无 run → null（fail-soft 不猜）', () => {
    expect(deriveResultContract({ task: {}, latest_summary: null, runs: [] })).toBeNull()
  })

  it('有 summary 即可成形最小信封并通过校验', () => {
    const r = deriveResultContract({
      task: { result: '完成登录提示修复' },
      latest_summary: null,
      runs: [],
    })
    expect(r).not.toBeNull()
    expect(r!.envelope.resultVersion).toBe(1)
    expect(r!.envelope.summary).toContain('登录提示')
    expect(r!.validation.ok).toBe(true)
  })

  it('completion_receipt 派生 claims+evidence（criteria.evidence.path→可定位引用）', () => {
    const r = deriveResultContract({
      task: { workflow_template_id: 'feedback-analysis' },
      latest_summary: '反馈分析完成',
      runs: [{
        profile: 'ops',
        ended_at: 1793800000_000,
        metadata: {
          completion_receipt: {
            criteria: [
              { id: 'AC-1', status: 'pass', note: '测试全绿', evidence: [{ kind: 'tap', path: 'evidence/tap.xml', sha256: 'ab' }] },
              { id: 'AC-2', status: 'pass', note: '无证据判据', evidence: [] },
            ],
            artifacts: [{ path: 'runs/r1/evidence/report.md', sha256: 'cd' }],
          },
          artifacts: ['runs/r1/report.pdf'],
        },
      }],
    })
    expect(r).not.toBeNull()
    const claims = r!.envelope.claims!
    expect(claims).toHaveLength(2)
    expect(claims[0].evidence[0]).toMatchObject({ sourceId: 'evidence/tap.xml', role: 'supports' })
    // AC-2 无证据 → 校验器如实判违规（claim-no-evidence）
    expect(r!.validation.ok).toBe(false)
    expect(r!.validation.problems.some((p) => p.rule === 'claim-no-evidence')).toBe(true)
    expect(r!.envelope.evidence![0].locator).toEqual({ kind: 'path', value: 'runs/r1/evidence/report.md' })
    expect(r!.envelope.artifactRefs).toEqual([{ kind: 'file', ref: 'runs/r1/report.pdf' }])
    expect(r!.envelope.generatorVersion).toBe('feedback-analysis@ops')
    expect(r!.envelope.generatedAt).toBe(new Date(1793800000_000).toISOString())
  })

  it('metadata 损坏（非对象）不炸：回落最小信封', () => {
    const r = deriveResultContract({
      task: {},
      latest_summary: 's',
      runs: [{ metadata: null }],
    })
    expect(r!.validation.ok).toBe(true)
  })
})
