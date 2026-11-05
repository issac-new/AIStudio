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

describe('decideDualSignGate：审批期闸（纯函数五态）', () => {
  const base = {
    targetId: 'enf:abc', actor: 'alice', risk: 'high', decision: 'approve',
    priorSigners: [] as string[], enabled: true,
  }

  it('关闭时不适用且放行', async () => {
    const { decideDualSignGate } = await import('../dualsign')
    const r = decideDualSignGate({ ...base, enabled: false })
    expect(r.applicable).toBe(false)
    expect(r.allow).toBe(true)
  })

  it('非高风险不适用（中/低/未评级都放行）', async () => {
    const { decideDualSignGate } = await import('../dualsign')
    for (const risk of ['medium', 'low', undefined]) {
      const r = decideDualSignGate({ ...base, risk })
      expect(r.applicable).toBe(false)
      expect(r.allow).toBe(true)
    }
  })

  it('否决不需要双签', async () => {
    const { decideDualSignGate } = await import('../dualsign')
    const r = decideDualSignGate({ ...base, decision: 'reject' })
    expect(r.applicable).toBe(false)
    expect(r.allow).toBe(true)
    expect(r.reason).toContain('否决')
  })

  it('自己一签被拦，换人凑够即放行', async () => {
    const { decideDualSignGate } = await import('../dualsign')
    const first = decideDualSignGate({ ...base })
    expect(first.applicable).toBe(true)
    expect(first.allow).toBe(false)
    expect(first.code).toBe('dual-sign-required')
    expect(first.signers).toEqual(['alice'])

    const second = decideDualSignGate({ ...base, actor: 'bob', priorSigners: ['alice'] })
    expect(second.allow).toBe(true)
    expect(second.signers).toEqual(['alice', 'bob'])
  })

  it('单操作员豁免放行并标 waived；非法 waiver 值不放行', async () => {
    const { decideDualSignGate } = await import('../dualsign')
    const ok = decideDualSignGate({ ...base, waiver: 'single-operator' })
    expect(ok.allow).toBe(true)
    expect(ok.waived).toBe(true)

    const bad = decideDualSignGate({ ...base, waiver: 'i-promise' })
    expect(bad.allow).toBe(false)
  })

  it('未知决策词按不适用放过（合法性校验属路由分支，不在闸里猜）', async () => {
    const { decideDualSignGate } = await import('../dualsign')
    const r = decideDualSignGate({ ...base, decision: 'maybe' })
    expect(r.applicable).toBe(false)
    expect(r.allow).toBe(true)
  })

  it('uniqueSigners 去空去重（同一人签两次不算两人）', async () => {
    const { uniqueSigners } = await import('../dualsign')
    expect(uniqueSigners(['alice', ' alice ', '', '  ', 'bob'])).toEqual(['alice', 'bob'])
  })
})
