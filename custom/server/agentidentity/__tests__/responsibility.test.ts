import { describe, expect, it } from 'vitest'
import {
  cardGaps, isScopeExpansion, normalizeRiskTier, readiness, separationNotice,
  type ResponsibilityCard, type ScopeSnapshot, validateCard,
} from '../responsibility'
import type { Person } from '../people'

const people: Person[] = [
  { id: 'p-1', name: 'alice', emails: [], active: true, source: 'manual', createdAt: 1 },
  { id: 'p-2', name: 'bob', emails: [], active: true, source: 'manual', createdAt: 1 },
  { id: 'p-3', name: 'carol', emails: [], active: false, source: 'manual', createdAt: 1 },
]
const base: ResponsibilityCard = {
  deliveryStandard: '交付可复现的测试报告',
  unitType: 'assistant',
  riskTier: 'tier2',
  collabLevel: 3,
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

  it('助手型不强制复核人：不填或同人只提示，不拦', () => {
    expect(validateCard(base, people)).toEqual([])
    expect(validateCard({ ...base, reviewer: 'p-1' }, people)).toEqual([])
    expect(separationNotice({ ...base, reviewer: 'p-1' })).toContain('未分离')
    expect(separationNotice(base)).toContain('未分离')
  })

  it('顶岗型必须复核人且不得与主责任人同一人', () => {
    const post = { ...base, unitType: 'post' as const }
    expect(validateCard(post, people).join()).toContain('顶岗型')
    expect(validateCard({ ...post, reviewer: 'p-1' }, people).join()).toContain('不得为同一人')
    expect(validateCard({ ...post, reviewer: 'p-2' }, people)).toEqual([])
    // 顶岗型已分离时不再有「未分离」提示
    expect(separationNotice({ ...post, reviewer: 'p-2' })).toBeNull()
  })

  it('未声明类型是缺口（不得准入）', () => {
    const { unitType: _omit, ...noType } = base
    expect(validateCard(noType as ResponsibilityCard, people).join()).toContain('unitType')
  })

  it('旧风险档取值读侧映射：low→一级、medium/high→二级，不改写', () => {
    expect(normalizeRiskTier('low' as never)).toBe('tier1')
    expect(normalizeRiskTier('medium' as never)).toBe('tier2')
    expect(normalizeRiskTier('high' as never)).toBe('tier2')
    expect(normalizeRiskTier('tier3' as never)).toBe('tier3')
    expect(normalizeRiskTier(undefined)).toBeNull()
    expect(normalizeRiskTier('bogus' as never)).toBeNull()
  })

  it('风险档只收三级取值；旧值新保存拒绝（写入口径）', () => {
    expect(validateCard({ ...base, riskTier: 'tier1' }, people, { forSave: true }).join()).not.toContain('riskTier')
    expect(validateCard({ ...base, riskTier: 'tier3' }, people, { forSave: true }).join()).not.toContain('riskTier')
    expect(validateCard({ ...base, riskTier: 'medium' }, people, { forSave: true }).join()).toContain('riskTier')
  })

  it('读侧对存量旧风险档放行（D6：读侧映射不改写；旧档不是缺口，否则存量带卡单元合并当天全部停派）', () => {
    expect(validateCard({ ...base, riskTier: 'medium' }, people).join()).not.toContain('riskTier')
    expect(cardGaps({ ...base, riskTier: 'high' }, people)).toEqual([])
    expect(cardGaps({ ...base, riskTier: 'low' }, people)).toEqual([])
  })

  it('顶岗型下限按归一后的等级判：存量 high（归一为二级）满足下限，不因旧值被拦', () => {
    const post = { ...base, unitType: 'post' as const, reviewer: 'p-2' }
    expect(validateCard({ ...post, riskTier: 'high' }, people).join()).not.toContain('不得低于二级')
  })

  it('顶岗型风险档不得低于二级', () => {
    const post = { ...base, unitType: 'post' as const, reviewer: 'p-2' }
    expect(validateCard({ ...post, riskTier: 'tier1' }, people).join()).toContain('不得低于二级')
    expect(validateCard({ ...post, riskTier: 'tier2' }, people)).toEqual([])
    expect(validateCard({ ...post, riskTier: 'tier3' }, people)).toEqual([])
  })

  it('协作等级：1-3 直接可用；4 须标单点验证；5 须有通过的自治刻度配置', () => {
    for (const lv of [1, 2, 3] as const) {
      expect(validateCard({ ...base, collabLevel: lv }, people).join()).not.toContain('collabLevel')
    }
    expect(validateCard({ ...base, collabLevel: 4 }, people).join()).toContain('单点验证')
    expect(validateCard({ ...base, collabLevel: 4, collabLevelNote: '仅单点验证' }, people).join()).not.toContain('collabLevel')
    expect(validateCard({ ...base, collabLevel: 5 }, people).join()).toContain('自治刻度')
    expect(validateCard({ ...base, collabLevel: 5 }, people, { al5Configured: true }).join()).not.toContain('collabLevel')
    expect(validateCard({ ...base, collabLevel: 0 as never }, people).join()).toContain('collabLevel')
    expect(validateCard({ ...base, collabLevel: 9 as never }, people).join()).toContain('collabLevel')
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

describe('isScopeExpansion：变更前后对比，任一命中即扩权', () => {
  const snap: ScopeSnapshot = {
    can: ['读文件'], cannot: ['改生产配置'], toolAllowlist: ['read_file'], riskTier: 'tier2', collabLevel: 3,
  }

  it('完全相同不算扩权', () => {
    expect(isScopeExpansion(snap, { ...snap })).toEqual([])
  })

  it('能力边界变宽（能做增多／不做减少）算扩权', () => {
    expect(isScopeExpansion(snap, { ...snap, can: ['读文件', '写文件'] })).toContain('capability-can')
    expect(isScopeExpansion(snap, { ...snap, cannot: [] })).toContain('capability-cannot')
  })

  it('工具白名单变多算扩权；变少不算', () => {
    expect(isScopeExpansion(snap, { ...snap, toolAllowlist: ['read_file', 'bash'] })).toContain('tool-allowlist')
    expect(isScopeExpansion(snap, { ...snap, toolAllowlist: [] })).toEqual([])
  })

  it('风险档降低（人工介入变少）算扩权；升高不算', () => {
    expect(isScopeExpansion(snap, { ...snap, riskTier: 'tier1' })).toContain('risk-lowered')
    expect(isScopeExpansion(snap, { ...snap, riskTier: 'tier3' })).toEqual([])
  })

  it('协作等级升高算扩权；降低不算', () => {
    expect(isScopeExpansion(snap, { ...snap, collabLevel: 4 })).toContain('collab-raised')
    expect(isScopeExpansion(snap, { ...snap, collabLevel: 2 })).toEqual([])
  })
})

describe('readiness：五项能力就绪度', () => {
  const snapshot: ScopeSnapshot = {
    can: ['读文件'], cannot: [], toolAllowlist: ['read_file'], riskTier: 'tier2', collabLevel: 3,
  }

  it('无任何数据源时五项均 unknown 或 no，且都带缺口；绝不返回 yes', () => {
    const out = readiness({ snapshot, judgments: [] })
    expect(out.map((r) => r.id)).toEqual(['net-contribution', 'correction-channel', 'discretion', 'reliability', 'case-maintenance'])
    for (const r of out) {
      expect(r.state).not.toBe('yes')
      expect(r.gap).toBeTruthy()
    }
  })

  it('净贡献今天恒 unknown（无数据源）', () => {
    const out = readiness({ snapshot, judgments: [] })
    expect(out.find((r) => r.id === 'net-contribution')).toMatchObject({ state: 'unknown' })
  })

  it('有驳回类署名记录→纠错通道就绪（处置依据取人写的 rationale，不改 append-only 账本结构）', () => {
    const out = readiness({ snapshot, judgments: [judgment('rejection')] })
    expect(out.find((r) => r.id === 'correction-channel')).toMatchObject({ state: 'yes' })
    // 其他类别不算纠错通道
    expect(readiness({ snapshot, judgments: [judgment('acceptance')] }).find((r) => r.id === 'correction-channel')).toMatchObject({ state: 'no' })
  })

  it('有推翻／升级／暂停类署名记录→裁量保障就绪', () => {
    for (const kind of ['override', 'escalation', 'pause'] as const) {
      expect(readiness({ snapshot, judgments: [judgment(kind)] }).find((r) => r.id === 'discretion')).toMatchObject({ state: 'yes' })
    }
    expect(readiness({ snapshot, judgments: [judgment('acceptance')] }).find((r) => r.id === 'discretion')).toMatchObject({ state: 'no' })
  })

  it('可靠性检验：有用例版本且有稳定性重测读数才就绪；缺读数 unknown', () => {
    const tc = { ...snapshot, testCaseVersion: 'tc-1' }
    expect(readiness({ snapshot: tc, judgments: [], stabilityReadings: 2 }).find((r) => r.id === 'reliability')).toMatchObject({ state: 'yes' })
    expect(readiness({ snapshot: tc, judgments: [], stabilityReadings: 0 }).find((r) => r.id === 'reliability')).toMatchObject({ state: 'unknown' })
  })

  it('用例维护：有用例版本即就绪；无版本 no', () => {
    expect(readiness({ snapshot: { ...snapshot, testCaseVersion: 'tc-1' }, judgments: [] }).find((r) => r.id === 'case-maintenance')).toMatchObject({ state: 'yes' })
    expect(readiness({ snapshot, judgments: [] }).find((r) => r.id === 'case-maintenance')).toMatchObject({ state: 'no' })
  })
})

function judgment(kind: 'acceptance' | 'rejection' | 'override' | 'escalation' | 'pause' | 'capability') {
  return {
    id: 'j-1', unitId: 'aid-001', kind, subjectRef: 'task-1',
    rationale: '依据充分的人工复核记录，超过二十个字符', evidenceRefs: [],
    signedBy: 'p-1', signedAt: 1, source: 'human-entry' as const,
  }
}
