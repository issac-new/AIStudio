// W2 结果协议校验器：正反例全覆盖（源文 6.2 节确定性校验器语义）。
import { describe, expect, it } from 'vitest'
import { validateResultEnvelope, type ResultEnvelope } from '../result-contract'

const base: ResultEnvelope = {
  resultVersion: 1,
  generatedAt: '2026-11-04T12:00:00Z',
  generatorVersion: 'feedback-analysis@1.3.0',
  summary: '登录失败提示需覆盖网络异常场景',
}

describe('validateResultEnvelope', () => {
  it('最小合规信封通过', () => {
    expect(validateResultEnvelope(base)).toEqual({ ok: true, problems: [] })
  })

  it('summary 为空拒绝', () => {
    const r = validateResultEnvelope({ ...base, summary: '  ' })
    expect(r.ok).toBe(false)
    expect(r.problems.some((p) => p.rule === 'summary-empty')).toBe(true)
  })

  it('generatedAt 非 ISO 拒绝', () => {
    const r = validateResultEnvelope({ ...base, generatedAt: 'yesterday' })
    expect(r.problems.some((p) => p.rule === 'bad-generated-at')).toBe(true)
  })

  it('claim 无 supports 证据拒绝（无证据的结论不得进入交付）', () => {
    const r = validateResultEnvelope({
      ...base,
      claims: [{ id: 'rec-01', statement: '建议 A', evidence: [{ sourceId: 's', locator: { kind: 'path', value: 'x' }, role: 'context' }] }],
    })
    expect(r.problems.some((p) => p.rule === 'claim-no-evidence')).toBe(true)
  })

  it('claim 证据 locator 空值拒绝', () => {
    const r = validateResultEnvelope({
      ...base,
      claims: [{ id: 'rec-01', statement: '建议 A', evidence: [{ sourceId: 's', locator: { kind: 'row', value: '' }, role: 'supports' }] }],
    })
    expect(r.problems.some((p) => p.rule === 'evidence-locator-empty')).toBe(true)
  })

  it('priority 越界拒绝（必须 P0-P3 枚举）', () => {
    const r = validateResultEnvelope({
      ...base,
      claims: [{ id: 'rec-01', statement: 'A', priority: 'P9' as never, evidence: [{ sourceId: 's', locator: { kind: 'row', value: 'row:3' }, role: 'supports' }] }],
    })
    expect(r.problems.some((p) => p.rule === 'claim-bad-priority')).toBe(true)
  })

  it('confidence 超出 [0,1] 拒绝', () => {
    const r = validateResultEnvelope({
      ...base,
      claims: [{ id: 'rec-01', statement: 'A', confidence: 1.5, evidence: [{ sourceId: 's', locator: { kind: 'row', value: 'row:3' }, role: 'supports' }] }],
    })
    expect(r.problems.some((p) => p.rule === 'claim-bad-confidence')).toBe(true)
  })

  it('externalRecordId 只能在 external-record 产物上出现（未写先报拒绝）', () => {
    const r = validateResultEnvelope({
      ...base,
      artifactRefs: [{ kind: 'file', ref: '/tmp/report.md', externalRecordId: 'record_1024' }],
    })
    expect(r.problems.some((p) => p.rule === 'external-id-without-record')).toBe(true)
    const ok = validateResultEnvelope({
      ...base,
      artifactRefs: [{ kind: 'external-record', ref: 'tracker', externalRecordId: 'record_1024' }],
    })
    expect(ok.ok).toBe(true)
  })

  it('high/critical 风险无 nextActions 拒绝', () => {
    const r = validateResultEnvelope({ ...base, risks: [{ level: 'high', note: '数据迁移风险' }] })
    expect(r.problems.some((p) => p.rule === 'high-risk-no-action')).toBe(true)
    const ok = validateResultEnvelope({
      ...base,
      risks: [{ level: 'high', note: '数据迁移风险' }],
      nextActions: ['先在影子库演练'],
    })
    expect(ok.ok).toBe(true)
  })

  it('非对象输入拒绝且不抛异常', () => {
    const r = validateResultEnvelope(null as never)
    expect(r.ok).toBe(false)
  })
})
