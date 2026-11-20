// overlay/custom/server/orgworkbench/__tests__/agenda.test.ts
// 批三 T3 决策议程守门：六源只读投影（spec 2026-11-21-ai-native-orgworkbench-batch3 §三）。
// 六源全注入（读函数可抛异常）——本套不碰任何真实账本，只锁投影形状与 fail-soft 语义：
// 每源命中/未命中、单源失败不伪装零数据、例行进度不入、去重不重复计项、排序 age 降序。
import { describe, it, expect } from 'vitest'
import type { PendingItem, OutcomeRef } from '../../approval-inbox/pending-sources'
import type { Premise } from '../../premiselog/premise-log'
import type { ReviewCase, ReviewFinding, FindingVerification, RiskAssessment } from '../../reviewgov/types'
import type { EscalationRequest } from '../../escalation/escalation-store'
import type { ExpCandidate } from '../../expcandidates/exp-types'
import { buildAgenda, type AgendaDeps, type AgendaSourceKind } from '../agenda'

const NOW = 1_789_000_000_000
const DAY = 86_400_000
const HOUR = 3_600_000

// ── 夹具构造（只填各正身必填字段；投影不得依赖缺席字段时猜数）──

function emptyDeps(): AgendaDeps {
  return {
    collectPendingItems: () => [],
    listContracts: () => [],
    listPremises: () => [],
    listCases: () => [],
    listPendingEscalations: () => [],
    listCandidates: () => [],
    listDraftTeams: () => [],
  }
}

const outcomeRef = (outcomeId: string): OutcomeRef => ({
  outcomeId,
  contractVersion: 1,
  ownerPersonId: 'p-owner',
  verificationOwnerId: 'p-verifier',
})

function pend(id: string, over: Partial<PendingItem> = {}): PendingItem {
  return {
    id,
    kind: 'command',
    title: `条目 ${id}`,
    detail: 'detail',
    createdAt: NOW - DAY,
    risk: 'medium',
    ...over,
  }
}

function premise(id: string, over: Partial<Premise> = {}): Premise {
  return {
    id,
    statement: '若三日内登录率低于 40%，则注册流程存在断点',
    kind: 'market',
    scope: ['custom/server/orgworkbench'],
    reviewAt: NOW - 3 * DAY,
    status: 'hold',
    confidence: 'medium',
    createdAt: NOW - 30 * DAY,
    createdBy: 'p-analyst',
    updatedAt: NOW - 30 * DAY,
    ...over,
  }
}

function finding(
  findingId: string,
  verifications: FindingVerification[],
  over: Partial<ReviewFinding> = {},
): ReviewFinding {
  return {
    findingId,
    file: 'custom/server/x.ts',
    line: 10,
    body: '该分支漏了空值检查',
    severity: 'important',
    origin: 'new',
    authorKind: 'agent',
    round: 1,
    dedupeKey: `k-${findingId}`,
    state: 'open',
    deferred: false,
    duplicateCount: 0,
    verifications,
    createdAt: NOW - 2 * DAY,
    ...over,
  }
}

function reviewCase(caseId: string, findings: ReviewFinding[]): ReviewCase {
  const risk: RiskAssessment = {
    tier: 'medium',
    requiredHumanApprovals: 1,
    reasons: [],
    protectedHits: [],
    sensitiveHits: [],
    trustedAuthor: false,
    breakerTightened: false,
    classifiedAt: NOW,
  }
  return {
    caseId,
    title: `评审 ${caseId}`,
    authorKind: 'agent',
    changedPaths: [],
    diffLines: 10,
    behindFlag: false,
    risk,
    rounds: [],
    findings,
    approvals: [],
    checks: 'unknown',
    state: 'open',
    createdAt: NOW - 5 * DAY,
    updatedAt: NOW,
  }
}

function escalation(id: string, over: Partial<EscalationRequest> = {}): EscalationRequest {
  return {
    escalationId: id,
    fromAgent: 'agent-hu',
    scope: { tool: 'terminal_exec' },
    urgency: 'normal',
    reason: '需要写权限',
    at: NOW - 6 * HOUR,
    state: 'pending',
    ...over,
  }
}

function candidate(id: string, over: Partial<ExpCandidate> = {}): ExpCandidate {
  return {
    id,
    type: 'antipattern',
    statement: '同类拦截反复出现，建议先跑检查再提交',
    fingerprint: `fp-${id}`,
    evidence: [{ taskId: 't-901', note: '三次拦截', at: Math.floor((NOW - DAY) / 1000) }],
    status: 'candidate',
    createdAt: new Date(NOW - 2 * DAY).toISOString(),
    updatedAt: new Date(NOW - DAY).toISOString(),
    injectedRuns: [],
    ...over,
  }
}

const ALL_SOURCES: AgendaSourceKind[] = [
  'approvals', 'outcome_contracts', 'premises', 'review_cases', 'escalations', 'exp_candidates', 'outcome_teams',
]

describe('决策议程投影：源1 待审批/双签（approvals）', () => {
  it('dualSignRequired===true → dual_sign_pending，形状完整（owner/outcomeId/riskTier/age/sourceRef）', () => {
    const deps = emptyDeps()
    deps.collectPendingItems = () => [pend('fleetfile:rq-1', {
      dualSignRequired: true,
      outcomeRef: outcomeRef('oc-1'),
      createdAt: NOW - 3 * DAY,
      risk: 'high',
    })]
    const r = buildAgenda(deps, NOW)
    const src = r.sources.approvals
    expect(src.available).toBe(true)
    expect(src.itemCount).toBe(1)
    const item = src.items![0]
    expect(item.kind).toBe('dual_sign_pending')
    expect(item.outcomeId).toBe('oc-1')
    expect(item.owner).toBe('p-owner')
    expect(item.riskTier).toBe('high')
    expect(item.age).toBe(3)
    expect(item.sourceRef).toBe('approval-inbox:fleetfile:rq-1')
    expect(item.agendaId).toBe('dual_sign_pending:fleetfile:rq-1')
    expect(item.question).toContain('fleetfile:rq-1')
    expect(item.evidenceRefs).toEqual(['fleetfile:rq-1'])
    expect(r.generatedAt).toBe(NOW)
  })

  it('双签与 outcome 绑定并存只计 dual_sign_pending 一项（不重复计项）', () => {
    const deps = emptyDeps()
    deps.collectPendingItems = () => [pend('mx:$e1', { dualSignRequired: true, outcomeRef: outcomeRef('oc-2') })]
    const r = buildAgenda(deps, NOW)
    expect(r.sources.approvals.itemCount).toBe(1)
    expect(r.sources.approvals.items![0].kind).toBe('dual_sign_pending')
  })

  it('outcomeRef 非空非双签 → approval_pending', () => {
    const deps = emptyDeps()
    deps.collectPendingItems = () => [pend('deferredfile:d1', { outcomeRef: outcomeRef('oc-3') })]
    const r = buildAgenda(deps, NOW)
    const item = r.sources.approvals.items![0]
    expect(item.kind).toBe('approval_pending')
    expect(item.outcomeId).toBe('oc-3')
    expect(item.agendaId).toBe('approval_pending:deferredfile:d1')
  })

  it('例行审批（无 outcomeRef 且非双签）不入议程——itemCount 只计入选条目', () => {
    const deps = emptyDeps()
    deps.collectPendingItems = () => [
      pend('fleet:s1:a1'),                              // 例行命令审批
      pend('review:r1', { kind: 'review' }),            // 例行评审卡
      pend('enf:e1'),                                   // 例行执法批单
      pend('fleetfile:rq-2', { outcomeRef: outcomeRef('oc-4') }),
    ]
    const r = buildAgenda(deps, NOW)
    const src = r.sources.approvals
    expect(src.available).toBe(true)
    expect(src.itemCount).toBe(1)
    expect(src.items![0].agendaId).toBe('approval_pending:fleetfile:rq-2')
  })

  it('同源内排序 age 降序', () => {
    const deps = emptyDeps()
    deps.collectPendingItems = () => [
      pend('fleetfile:old', { outcomeRef: outcomeRef('oc-a'), createdAt: NOW - 10 * DAY }),
      pend('fleetfile:new', { outcomeRef: outcomeRef('oc-b'), createdAt: NOW - 2 * HOUR }),
    ]
    const items = buildAgenda(deps, NOW).sources.approvals.items!
    expect(items).toHaveLength(2)
    expect(items[0].age).toBeGreaterThanOrEqual(items[1].age)
    expect(items[0].agendaId).toBe('approval_pending:fleetfile:old') // age 降序＝最老在前
  })
})

describe('源2 逾期结果（outcome_contracts）', () => {
  it('dueAt<=now 且 status∈{active,observing} → outcome_overdue；终态/未到期/无 dueAt 不入', () => {
    const deps = emptyDeps()
    deps.listContracts = () => [
      { outcomeId: 'oc-due', title: '支付重构', dueAt: NOW - 2 * DAY, status: 'active', ownerPersonId: 'p-owner', riskTier: 'high', updatedAt: NOW - DAY },
      { outcomeId: 'oc-observing', title: '灰度观察', dueAt: NOW - DAY, status: 'observing', ownerPersonId: 'p-owner', riskTier: 'low', updatedAt: NOW },
      { outcomeId: 'oc-settled', title: '已结算', dueAt: NOW - 2 * DAY, status: 'settled', ownerPersonId: 'p-owner', riskTier: 'low', updatedAt: NOW },
      { outcomeId: 'oc-cancelled', title: '已取消', dueAt: NOW - 2 * DAY, status: 'cancelled', ownerPersonId: 'p-owner', riskTier: 'low', updatedAt: NOW },
      { outcomeId: 'oc-future', title: '未到期', dueAt: NOW + DAY, status: 'active', ownerPersonId: 'p-owner', riskTier: 'low', updatedAt: NOW },
      { outcomeId: 'oc-nodue', title: '无时限', status: 'active', ownerPersonId: 'p-owner', riskTier: 'low', updatedAt: NOW },
    ]
    const r = buildAgenda(deps, NOW)
    const src = r.sources.outcome_contracts
    expect(src.available).toBe(true)
    expect(src.itemCount).toBe(2)
    const ids = src.items!.map((i) => i.agendaId)
    expect(ids).toContain('outcome_overdue:oc-due')
    expect(ids).toContain('outcome_overdue:oc-observing')
    const due = src.items!.find((i) => i.outcomeId === 'oc-due')!
    expect(due.owner).toBe('p-owner')
    expect(due.riskTier).toBe('high')
    expect(due.age).toBe(2)
    expect(due.sourceRef).toBe('outcome-contract:oc-due')
    expect(due.evidenceRefs).toEqual(['oc-due'])
  })

  it('同一 outcome 重复出现在合同列表只计一项（agendaId 去重）', () => {
    const deps = emptyDeps()
    const row = { outcomeId: 'oc-dup', title: 'x', dueAt: NOW - DAY, status: 'active', ownerPersonId: 'p', riskTier: 'low' as const, updatedAt: NOW }
    deps.listContracts = () => [row, { ...row }]
    const src = buildAgenda(deps, NOW).sources.outcome_contracts
    expect(src.itemCount).toBe(1)
  })
})

describe('源3 PremiseLog（premises）', () => {
  it('到期 hold/pending → premise_due（age 自 reviewAt 起算，保留 1 位小数）', () => {
    const deps = emptyDeps()
    deps.listPremises = () => [
      premise('pr-1', { reviewAt: NOW - 36 * HOUR }),                      // 1.5 天
      premise('pr-2', { status: 'pending', reviewAt: NOW - DAY }),         // pending 也算到期
      premise('pr-future', { reviewAt: NOW + DAY }),                       // 未到期不入
      premise('pr-refuted-in-due', { status: 'refuted', reviewAt: NOW - DAY }), // refuted 不入到期队列
    ]
    const src = buildAgenda(deps, NOW).sources.premises
    expect(src.itemCount).toBe(3)
    const ids = src.items!.map((i) => i.agendaId).sort()
    expect(ids).toEqual(['premise_due:pr-1', 'premise_due:pr-2', 'premise_refuted:pr-refuted-in-due'])
    // refuted 不入到期队列（dueQueue 只收 hold/pending）——它以 premise_refuted 单列，不重复计项
    expect(src.items!.find((i) => i.outcomeId === undefined && i.agendaId.includes('pr-refuted-in-due'))!.kind).toBe('premise_refuted')
    const one = src.items!.find((i) => i.outcomeId === undefined && i.agendaId === 'premise_due:pr-1')!
    expect(one.age).toBe(1.5)
    expect(one.owner).toBe('p-analyst')
    expect(one.sourceRef).toBe('premiselog:pr-1')
  })

  it('status===refuted → premise_refuted（evidence 带推翻证据，age 自推翻时刻）', () => {
    const deps = emptyDeps()
    deps.listPremises = () => [premise('pr-9', {
      status: 'refuted',
      refutedBy: { evidence: 'docs/reports/login-drop.md', at: NOW - 2 * DAY, by: 'p-analyst' },
    })]
    const src = buildAgenda(deps, NOW).sources.premises
    expect(src.itemCount).toBe(1)
    const item = src.items![0]
    expect(item.kind).toBe('premise_refuted')
    expect(item.age).toBe(2)
    expect(item.evidenceRefs).toEqual(['pr-9', 'docs/reports/login-drop.md'])
    expect(item.sourceRef).toBe('premiselog:pr-9')
  })
})

describe('源4 评审分歧（review_cases）', () => {
  it('open 态 finding verifications confirm+reject 并存 → review_disagreement', () => {
    const deps = emptyDeps()
    deps.listCases = () => [reviewCase('case-1', [
      finding('f-mixed', [
        { voter: 'alice', actorKind: 'human', vote: 'confirm', at: NOW - DAY },
        { voter: 'agent-hu', actorKind: 'agent', vote: 'reject', at: NOW - 12 * HOUR },
      ], { evidence: '终端输出 #11' }),
    ])]
    const src = buildAgenda(deps, NOW).sources.review_cases
    expect(src.itemCount).toBe(1)
    const item = src.items![0]
    expect(item.kind).toBe('review_disagreement')
    expect(item.agendaId).toBe('review_disagreement:case-1/f-mixed')
    expect(item.sourceRef).toBe('reviewgov:case-1/f-mixed')
    expect(item.evidenceRefs).toEqual(['f-mixed', 'case-1', '终端输出 #11'])
    expect(item.age).toBe(2)
  })

  it('只有 confirm、或非 open 态的分歧票型不入', () => {
    const deps = emptyDeps()
    deps.listCases = () => [reviewCase('case-2', [
      finding('f-only-confirm', [{ voter: 'a', actorKind: 'human', vote: 'confirm', at: NOW }]),
      finding('f-answered-mixed', [
        { voter: 'a', actorKind: 'human', vote: 'confirm', at: NOW },
        { voter: 'b', actorKind: 'human', vote: 'reject', at: NOW },
      ], { state: 'answered' }),
    ])]
    const src = buildAgenda(deps, NOW).sources.review_cases
    expect(src.available).toBe(true)
    expect(src.itemCount).toBe(0)
    expect(src.items).toEqual([])
  })
})

describe('源5 升级（escalations）', () => {
  it('pending 升级 → escalation_pending（owner=发起 agent，age 自发起时刻）', () => {
    const deps = emptyDeps()
    deps.listPendingEscalations = () => [escalation('esc-1', { urgency: 'critical' })]
    const src = buildAgenda(deps, NOW).sources.escalations
    expect(src.itemCount).toBe(1)
    const item = src.items![0]
    expect(item.kind).toBe('escalation_pending')
    expect(item.owner).toBe('agent-hu')
    expect(item.age).toBe(0.3)
    expect(item.sourceRef).toBe('escalation:esc-1')
    expect(item.question).toContain('terminal_exec')
    expect(item.question).toContain('critical')
  })
})

describe('源6 学习候选（exp_candidates）', () => {
  it('status===candidate → learning_candidate（outcomeId 可选关联携带）；approved 不入', () => {
    const deps = emptyDeps()
    deps.listCandidates = () => [
      candidate('exp-1', { outcomeId: 'oc-learn' }),
      candidate('exp-2', { status: 'approved' }),
    ]
    const src = buildAgenda(deps, NOW).sources.exp_candidates
    expect(src.itemCount).toBe(1)
    const item = src.items![0]
    expect(item.kind).toBe('learning_candidate')
    expect(item.outcomeId).toBe('oc-learn')
    expect(item.age).toBe(2)
    expect(item.sourceRef).toBe('expcandidates:exp-1')
  })
})

describe('源6 待确认团队（outcome_teams）', () => {
  it('draft 团队 → team_pending（outcomeId/version 定位）', () => {
    const deps = emptyDeps()
    deps.listDraftTeams = () => [{ outcomeId: 'oc-team', version: 3, updatedAt: NOW - 5 * DAY }]
    const src = buildAgenda(deps, NOW).sources.outcome_teams
    expect(src.itemCount).toBe(1)
    const item = src.items![0]
    expect(item.kind).toBe('team_pending')
    expect(item.outcomeId).toBe('oc-team')
    expect(item.age).toBe(5)
    expect(item.sourceRef).toBe('outcome-team:oc-team')
    expect(item.question).toContain('v3')
  })
})

describe('fail-soft：源失败≠没有待决事项', () => {
  it('单源抛异常 → 该源 available:false＋error＋无 items；他源照常聚合', () => {
    const deps = emptyDeps()
    deps.collectPendingItems = () => [pend('fleetfile:rq-ok', { outcomeRef: outcomeRef('oc-ok') })]
    deps.listCases = () => { throw new Error('评审账本目录不可读') }
    deps.listContracts = () => { throw new Error('合同账本坏档') }
    const r = buildAgenda(deps, NOW)
    expect(r.sources.review_cases.available).toBe(false)
    expect(r.sources.review_cases.error).toContain('评审账本目录不可读')
    expect(r.sources.review_cases.items).toBeUndefined()
    expect(r.sources.outcome_contracts.available).toBe(false)
    // 他源不受牵连
    expect(r.sources.approvals.available).toBe(true)
    expect(r.sources.approvals.itemCount).toBe(1)
    expect(r.sources.escalations.available).toBe(true)
  })

  it('失败源与「正常空源」可区分——不把失败伪装成零数据', () => {
    const deps = emptyDeps()
    deps.listPremises = () => { throw new Error('boom') }
    const r = buildAgenda(deps, NOW)
    const failed = r.sources.premises
    const emptyOk = r.sources.escalations
    expect(failed.available).toBe(false)
    expect(typeof failed.error).toBe('string')
    expect(failed.itemCount).toBe(0)
    expect(failed.items).toBeUndefined()
    expect(emptyOk.available).toBe(true)
    expect(emptyOk.itemCount).toBe(0)
    expect(emptyOk.items).toEqual([])
    expect(emptyOk.error).toBeUndefined()
  })

  it('非 Error 异常也收进 error 字符串（不向上抛）', () => {
    const deps = emptyDeps()
    deps.listDraftTeams = () => { throw 'raw string failure' }
    const r = buildAgenda(deps, NOW)
    expect(r.sources.outcome_teams.available).toBe(false)
    expect(r.sources.outcome_teams.error).toContain('raw string failure')
  })

  // T3 审查 I-1 补齐：approvals/escalations/exp_candidates 三源此前无逐源失败用例——
  // 逐源 available 的诚实性必须每源各有失败锚，缺一格即装配层吞错也无人抓。
  it('approvals 源失败 → available:false 且他源照常（T3 审查 I-1）', () => {
    const deps = emptyDeps()
    deps.collectPendingItems = () => { throw new Error('收件箱队列目录不可读') }
    deps.listCandidates = () => [candidate('exp-1')]
    const r = buildAgenda(deps, NOW)
    expect(r.sources.approvals.available).toBe(false)
    expect(r.sources.approvals.error).toContain('收件箱队列目录不可读')
    expect(r.sources.approvals.items).toBeUndefined()
    expect(r.sources.exp_candidates.available).toBe(true)
    expect(r.sources.exp_candidates.itemCount).toBe(1)
  })

  it('escalations 源失败 → available:false 且他源照常（T3 审查 I-1）', () => {
    const deps = emptyDeps()
    deps.listPendingEscalations = () => { throw new Error('升级分册损坏') }
    const r = buildAgenda(deps, NOW)
    expect(r.sources.escalations.available).toBe(false)
    expect(r.sources.escalations.error).toContain('升级分册损坏')
    expect(r.sources.escalations.items).toBeUndefined()
    expect(r.sources.premises.available).toBe(true)
  })

  it('exp_candidates 源失败 → available:false 且他源照常（T3 审查 I-1）', () => {
    const deps = emptyDeps()
    deps.listCandidates = () => { throw new Error('经验候选库被锁') }
    const r = buildAgenda(deps, NOW)
    expect(r.sources.exp_candidates.available).toBe(false)
    expect(r.sources.exp_candidates.error).toContain('经验候选库被锁')
    expect(r.sources.exp_candidates.items).toBeUndefined()
    expect(r.sources.approvals.available).toBe(true)
    expect(r.sources.approvals.itemCount).toBe(0)
  })
})

describe('全空与全覆盖', () => {
  it('全部源空 → 七源 available:true、itemCount:0', () => {
    const r = buildAgenda(emptyDeps(), NOW)
    expect(Object.keys(r.sources).sort()).toEqual([...ALL_SOURCES].sort())
    for (const kind of ALL_SOURCES) {
      expect(r.sources[kind].available, kind).toBe(true)
      expect(r.sources[kind].itemCount, kind).toBe(0)
      expect(r.sources[kind].items, kind).toEqual([])
    }
    expect(r.generatedAt).toBe(NOW)
  })

  it('generatedAt=注入 now（装配层传 Date.now()，投影可测）', () => {
    const r = buildAgenda(emptyDeps(), NOW + 123)
    expect(r.generatedAt).toBe(NOW + 123)
  })
})
