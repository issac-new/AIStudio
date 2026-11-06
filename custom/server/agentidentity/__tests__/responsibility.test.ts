import { describe, expect, it } from 'vitest'
import { cardGaps, type ResponsibilityCard, validateCard } from '../responsibility'
import type { Person } from '../people'

const people: Person[] = [
  { id: 'p-1', name: 'alice', emails: [], active: true, source: 'manual', createdAt: 1 },
  { id: 'p-2', name: 'bob', emails: [], active: true, source: 'manual', createdAt: 1 },
  { id: 'p-3', name: 'carol', emails: [], active: false, source: 'manual', createdAt: 1 },
]
const base: ResponsibilityCard = {
  deliveryStandard: '交付可复现的测试报告',
  riskTier: 'medium',
  primaryOwner: 'p-1',
  escalation: ['关键规则无法验证时升级'],
  pauseConditions: ['出现越权调用时暂停'],
  takerOver: 'p-2',
  testCaseVersion: 'tc-2026-11-06',
  costBudget: { limit: 100, unit: 'CNY/轮' },
  maintainer: 'p-1',
  deploymentLocation: 'studio:8802',
}

describe('responsibility card', () => {
  it('完整卡无缺口', () => {
    expect(validateCard(base, people)).toEqual([])
  })

  it('高风险必须复核人且不得与主责任人同一人', () => {
    expect(validateCard({ ...base, riskTier: 'high' }, people).join()).toContain('复核人')
    expect(validateCard({ ...base, riskTier: 'high', reviewer: 'p-1' }, people).join()).toContain('不得为同一人')
    expect(validateCard({ ...base, riskTier: 'high', reviewer: 'p-2' }, people)).toEqual([])
  })

  it('非 active 自然人拒绝', () => {
    expect(validateCard({ ...base, primaryOwner: 'p-3' }, people).join()).toContain('在岗')
  })

  it('准入证据三组与业务负责人签署必填', () => {
    const gaps = cardGaps(base, people, { forAdmission: true })
    expect(gaps.map((g) => g.field)).toEqual(expect.arrayContaining(['admission-evidence', 'business-owner-sign']))
  })

  it('缺卡返回缺口而不是抛异常', () => {
    expect(cardGaps(undefined, people).length).toBeGreaterThan(0)
  })
})
