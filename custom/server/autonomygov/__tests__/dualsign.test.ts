import { describe, expect, it } from 'vitest'
import { dualSignSatisfied, highRiskOptions, HIGH_RISK_CLASSES } from '../dualsign'

describe('dualSignSatisfied：高风险类双签', () => {
  it('非高风险类不要求双签', () => {
    const r = dualSignSatisfied({ klass: 'minor-copy-fix', signatures: [] })
    expect(r.required).toBe(false)
    expect(r.satisfied).toBe(true)
  })

  it('高风险类无签署不满足，理由点名类别与「无签署记录」', () => {
    const r = dualSignSatisfied({ klass: 'production-release', signatures: [] })
    expect(r.required).toBe(true)
    expect(r.satisfied).toBe(false)
    expect(r.reason).toContain('生产发布')
    expect(r.reason).toContain('无签署')
  })

  it('只有一人签署不满足，理由点名缺第二签', () => {
    const r = dualSignSatisfied({
      klass: 'privilege-escalation',
      signatures: [{ by: 'alice', at: 1 }],
    })
    expect(r.satisfied).toBe(false)
    expect(r.distinctSigners).toBe(1)
    expect(r.reason).toContain('缺第二签')
    expect(r.reason).toContain('alice')
  })

  it('两个不同人签署即满足', () => {
    const r = dualSignSatisfied({
      klass: 'data-egress',
      signatures: [{ by: 'alice', at: 1 }, { by: 'bob', at: 2 }],
    })
    expect(r.satisfied).toBe(true)
    expect(r.distinctSigners).toBe(2)
  })

  it('同一人签两次不算双签（重复签署不充数）', () => {
    const r = dualSignSatisfied({
      klass: 'model-replacement',
      signatures: [{ by: 'alice', at: 1 }, { by: 'alice', at: 2 }],
    })
    expect(r.satisfied).toBe(false)
    expect(r.distinctSigners).toBe(1)
  })

  it('空签署人不计入（防空签绕过）', () => {
    const r = dualSignSatisfied({
      klass: 'destructive-delete',
      signatures: [{ by: '', at: 1 }, { by: '   ', at: 2 }, { by: 'bob', at: 3 }],
    })
    expect(r.distinctSigners).toBe(1)
    expect(r.satisfied).toBe(false)
  })

  it('签署人前后空白被归一（"alice" 与 " alice " 视为同一人）', () => {
    const r = dualSignSatisfied({
      klass: 'production-release',
      signatures: [{ by: 'alice', at: 1 }, { by: ' alice ', at: 2 }],
    })
    expect(r.distinctSigners).toBe(1)
    expect(r.satisfied).toBe(false)
  })

  it('signatures 非数组时按无签署处理，不抛异常', () => {
    const r = dualSignSatisfied({ klass: 'production-release', signatures: 'nope' })
    expect(r.satisfied).toBe(false)
    expect(r.distinctSigners).toBe(0)
  })

  it('五类高风险全覆盖，且选项带中文标题', () => {
    expect(HIGH_RISK_CLASSES).toHaveLength(5)
    const opts = highRiskOptions()
    expect(opts.map((o) => o.klass)).toEqual([...HIGH_RISK_CLASSES])
    expect(opts.every((o) => Boolean(o.title))).toBe(true)
  })
})
