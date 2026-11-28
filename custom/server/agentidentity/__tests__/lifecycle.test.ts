import { describe, expect, it } from 'vitest'
import { canTransition, initialLifecycle, stageOf } from '../lifecycle'
import { cardRevision, type ResponsibilityCard, type ScopeSnapshot } from '../responsibility'
import type { Person } from '../people'

const people: Person[] = [
  { id: 'p-1', name: 'alice', emails: [], active: true, source: 'manual', createdAt: 1 },
  { id: 'p-2', name: 'bob', emails: [], active: true, source: 'manual', createdAt: 1 },
]
const card: ResponsibilityCard = {
  deliveryStandard: 'x', unitType: 'assistant', riskTier: 'tier2', collabLevel: 3, primaryOwner: 'p-1',
  escalation: ['e'], pauseConditions: ['p'], takerOver: 'p-2',
  testCaseVersion: 'tc-1', costBudget: { limit: 1, unit: 'CNY/轮' },
  maintainer: 'p-1', deploymentLocation: 'loc',
  admissionEvidence: { representativeTasks: ['t'], edgeCases: ['e'], dataPermissionReview: ['d'], recordedAt: 1 },
}
// 签署须带版本指纹（2026-11-24 批一）：指纹按卡内容实时计算，stale=false 旧契约夹具才能过新准入门
card.businessOwnerSign = { signedBy: 'p-1', signedAt: 1, cardRevision: cardRevision(card), stale: false }
// 户口五要素齐备（2026-11-27 框架对齐：准入并查户口，空白名单不再可准入）
const roster = {
  name: 'u', owner: 'o', toolAllowlist: ['read_file'],
  capabilityBoundary: { can: ['读文件'], cannot: ['改生产配置'] },
  auditRequirement: { sampling: 0.1, retentionDays: 30 },
}
const base = { ...roster, responsibilityCard: card, lifecycle: initialLifecycle() }
const running = { ...base, lifecycle: { stage: 'running' as const, history: [] } }
const changingWith = (snapshot?: ScopeSnapshot) => ({
  ...base,
  lifecycle: {
    stage: 'changing' as const,
    history: snapshot
      ? [{ from: 'running' as const, to: 'changing' as const, at: 1, by: 'p-1', reason: '改边界', evidenceRefs: [], snapshot }]
      : [],
  },
})
/** 与 base 当前范围完全一致的快照（进入变更时的原样）。 */
const sameSnap: ScopeSnapshot = {
  can: ['读文件'], cannot: ['改生产配置'], toolAllowlist: ['read_file'], riskTier: 'tier2', collabLevel: 3, testCaseVersion: 'tc-1',
}

describe('lifecycle', () => {
  it('无生命周期按 registered', () => {
    expect(stageOf({ name: 'u', owner: 'o', toolAllowlist: [] } as never)).toBe('registered')
  })

  it('registered→admitted 需卡与准入证据', () => {
    expect(canTransition(base as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people).ok).toBe(true)
    expect(canTransition({ ...base, responsibilityCard: undefined } as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people).ok).toBe(false)
  })

  describe('准入并查户口（2026-11-27 框架对齐）', () => {
    it('户口齐备＋卡有效 → 可准入', () => {
      expect(canTransition(base as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people).problems).toEqual([])
    })

    it('权限范围（工具白名单）为空 → 不准入，问题点名权限范围', () => {
      const v = canTransition({ ...base, toolAllowlist: [] } as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people)
      expect(v.ok).toBe(false)
      expect(v.problems.join()).toContain('权限范围')
    })

    it('缺能力边界（能做／不做）→ 不准入', () => {
      const noCan = canTransition({ ...base, capabilityBoundary: { can: [], cannot: ['x'] } } as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people)
      expect(noCan.ok).toBe(false)
      expect(noCan.problems.join()).toContain('能做什么')
      const noCannot = canTransition({ ...base, capabilityBoundary: { can: ['x'], cannot: [] } } as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people)
      expect(noCannot.ok).toBe(false)
      expect(noCannot.problems.join()).toContain('不做什么')
    })

    it('缺审计要求 → 不准入', () => {
      const v = canTransition({ ...base, auditRequirement: undefined } as never, { to: 'admitted', by: 'p-1', reason: 'ok' }, people)
      expect(v.ok).toBe(false)
      expect(v.problems.join()).toContain('审计')
    })

    it('户口缺口与卡缺口同时报出（不是只报一处）', () => {
      const v = canTransition(
        { ...base, toolAllowlist: [], responsibilityCard: { ...card, unitType: undefined } } as never,
        { to: 'admitted', by: 'p-1', reason: 'ok' }, people,
      )
      expect(v.problems.join()).toContain('权限范围')
      expect(v.problems.join()).toContain('unitType')
    })
  })

  describe('变更后恢复（扩权须就绪或豁免）', () => {
    const evidence = ['重新验证', '重新授权']

    it('未扩权：维持两条证据即可恢复', () => {
      const v = canTransition(changingWith(sameSnap) as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: evidence }, people)
      expect(v.problems).toEqual([])
      expect(canTransition(changingWith(sameSnap) as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: ['a'] }, people).ok).toBe(false)
    })

    it('扩权且五项未就绪、无豁免 → 拒绝，问题点名扩权维度与未就绪项', () => {
      const widened = { ...changingWith(sameSnap), toolAllowlist: ['read_file', 'bash'] }
      const v = canTransition(widened as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: evidence }, people)
      expect(v.ok).toBe(false)
      expect(v.problems.join()).toContain('扩权')
      expect(v.problems.join()).toContain('白名单')
    })

    it('扩权但带豁免理由 → 放行', () => {
      const widened = { ...changingWith(sameSnap), toolAllowlist: ['read_file', 'bash'] }
      const v = canTransition(widened as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: evidence, expansionWaiver: '试点需要，已由业务负责人口头同意' }, people)
      expect(v.problems).toEqual([])
    })

    it('豁免理由只有空白 → 视为无豁免', () => {
      const widened = { ...changingWith(sameSnap), toolAllowlist: ['read_file', 'bash'] }
      const v = canTransition(widened as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: evidence, expansionWaiver: '   ' }, people)
      expect(v.ok).toBe(false)
    })

    it('进入变更时无快照（存量变更事件）→ 按无法判断处理，要求豁免理由', () => {
      const noSnap = changingWith()
      const refused = canTransition(noSnap as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: evidence }, people)
      expect(refused.ok).toBe(false)
      expect(refused.problems.join()).toContain('快照')
      const waived = canTransition(noSnap as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: evidence, expansionWaiver: '存量变更，范围未变' }, people)
      expect(waived.problems).toEqual([])
    })

    it('降风险档属于扩权：tier2→tier1 须豁免', () => {
      const lowered = { ...changingWith(sameSnap), responsibilityCard: { ...card, riskTier: 'tier1' } }
      const v = canTransition(lowered as never, { to: 'running', by: 'p-1', reason: 'ok', evidenceRefs: evidence }, people)
      expect(v.ok).toBe(false)
      expect(v.problems.join()).toContain('风险档')
    })
  })

  it('协作等级 5：无上下文不准入；带 al5Configured 上下文可准入', () => {
    const lv5 = { ...base, responsibilityCard: { ...card, collabLevel: 5 as const } }
    const input = { to: 'admitted' as const, by: 'p-1', reason: 'ok' }
    const noCtx = canTransition(lv5 as never, input, people)
    expect(noCtx.ok).toBe(false)
    expect(noCtx.problems.join()).toContain('自治刻度')
    expect(canTransition(lv5 as never, input, people, { al5Configured: true }).problems).toEqual([])
  })

  it('退役需交接项与确认人', () => {
    expect(canTransition(running as never, { to: 'retired', by: 'p-1', reason: 'x', exit: { kind: 'pause', items: [] } }, people).ok).toBe(false)
    expect(canTransition(running as never, { to: 'retired', by: 'p-1', reason: 'x', exit: { kind: 'pause', items: ['交接待办'], confirmedBy: 'p-2' } }, people).ok).toBe(true)
  })

  it('顶岗型退出确认人不得与主责任人同一人（按类型，不再看风险档）', () => {
    const post = { ...running, responsibilityCard: { ...card, unitType: 'post' as const, reviewer: 'p-2' } }
    const exit = { kind: 'pause' as const, items: ['交接'] }
    expect(canTransition(post as never, { to: 'retired', by: 'p-1', reason: 'x', exit: { ...exit, confirmedBy: 'p-1' } }, people).ok).toBe(false)
    expect(canTransition(post as never, { to: 'retired', by: 'p-1', reason: 'x', exit: { ...exit, confirmedBy: 'p-2' } }, people).ok).toBe(true)
    // 助手型不再因风险档被强制分离
    const assistant = { ...running, responsibilityCard: { ...card, unitType: 'assistant' as const } }
    expect(canTransition(assistant as never, { to: 'retired', by: 'p-1', reason: 'x', exit: { ...exit, confirmedBy: 'p-1' } }, people).ok).toBe(true)
  })

  it('迁移人必须 active 且理由非空', () => {
    expect(canTransition(base as never, { to: 'admitted', by: 'p-x', reason: 'ok' }, people).ok).toBe(false)
    expect(canTransition(base as never, { to: 'admitted', by: 'p-1', reason: ' ' }, people).ok).toBe(false)
  })

  it('非法迁移拒绝（registered 不能直接 running）', () => {
    expect(canTransition(base as never, { to: 'running', by: 'p-1', reason: 'ok' }, people).ok).toBe(false)
  })

  it('存量无字段身份不抛异常', () => {
    expect(() => canTransition({ name: 'u', owner: 'o', toolAllowlist: [] } as never, { to: 'retired', by: 'p-1', reason: 'x', exit: { kind: 'pause', items: ['i'] } }, people)).not.toThrow()
  })
})

