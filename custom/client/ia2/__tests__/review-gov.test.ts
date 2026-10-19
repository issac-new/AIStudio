// @vitest-environment jsdom
// 评审治理页签守门：纯视图函数 + 组件渲染 + 页签注册。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import {
  caseRow, kpiCards, openFindings, tierRows,
  type ReviewCaseView, type ReviewMetricsView, type ReviewPolicyView,
} from '../api/review-gov'
import { STAGE_TABS, DEFAULT_TAB, resolveTab } from '../stage-tabs'
import ReviewGovPanel from '../views/gov/ReviewGovPanel.vue'

vi.mock('../api/review-gov', async () => {
  const actual = await vi.importActual<typeof import('../api/review-gov')>('../api/review-gov')
  return {
    ...actual,
    fetchPolicy: vi.fn(),
    fetchCases: vi.fn(),
    fetchMetrics: vi.fn(),
    fetchCase: vi.fn(),
    recordApproval: vi.fn(),
    recordSignal: vi.fn(),
    answerFinding: vi.fn(),
    verifyFinding: vi.fn(),
    setChecks: vi.fn(),
    mergeCase: vi.fn(),
    openCase: vi.fn(),
    addFinding: vi.fn(),
  }
})
const api = await import('../api/review-gov')
const mock = api as unknown as Record<string, ReturnType<typeof vi.fn>>

const policy: ReviewPolicyView = {
  version: 1,
  tiers: { low: 0, medium: 1, high: 2 },
  trustedAuthors: ['alice'],
  protectedPaths: ['.github/workflows/**'],
  sensitivePaths: ['packages/**/cache/**'],
  docPaths: ['docs/**'],
  internalPaths: ['internal/**'],
  convergence: { maxRounds: 3, diffOnlyAfterRound: 2, nitBudgetPerRound: 5, deferPreexisting: true },
  circuitBreaker: { windowHours: 24, revertRateThreshold: 0.02, incidentCountThreshold: 2, escalateOneTier: true },
  largeDiffLines: 800,
  hugeDiffLines: 2000,
}

const breaker = {
  active: false, windowHours: 24, reverts: 0, merges: 3, incidents: 0,
  revertRate: 0, reasons: [], evaluatedAt: 1,
}

const caseView: ReviewCaseView = {
  caseId: 'case-1',
  title: '改缓存',
  authorKind: 'human',
  headCommit: 'c1',
  changedPaths: ['packages/server/src/cache/x.ts'],
  diffLines: 20,
  behindFlag: false,
  risk: {
    tier: 'medium', requiredHumanApprovals: 1,
    reasons: ['sensitive_path：命中敏感路径 packages/**/cache/**'],
    protectedHits: [], sensitiveHits: ['packages/**/cache/**'],
    trustedAuthor: false, breakerTightened: false, classifiedAt: 1,
  },
  rounds: [{ round: 1, changedPaths: ['packages/server/src/cache/x.ts'], startedAt: 1, diffOnly: false, findingsAdded: 1, nitCount: 0 }],
  findings: [{
    findingId: 'f1', file: 'packages/server/src/cache/x.ts', line: 3, body: '缓存穿透', severity: 'important',
    origin: 'new', authorKind: 'agent', round: 1, dedupeKey: 'x', state: 'open', deferred: false,
    duplicateCount: 0, verifications: [], createdAt: 1,
  }],
  approvals: [],
  checks: 'green',
  state: 'open',
  createdAt: 1,
  updatedAt: 1,
}

const detail = {
  case: caseView,
  readiness: {
    ready: false, blockers: ['human_approvals：0/1'], humanApprovals: 0, requiredHumanApprovals: 1,
    agentApprovals: 0, openImportant: 1, blockingFindings: ['f1'], checks: 'green' as const, roundCapHit: false,
  },
}

const metrics: ReviewMetricsView = {
  cases: 1, active: 1, merged: 0,
  firstRoundPassRate: 0.75, meanRounds: 1.5, p95Rounds: 3, fivePlusShare: 0.02,
  humanApprovalsMedian: 1, noiseRate: 0.1, preexistingShare: 0.05,
  deferredBacklog: 2, openImportant: 1, evalCases: 4, breaker,
}

describe('纯视图函数', () => {
  it('KPI 卡阈值色态：一轮通过率 ≥70% 绿、5+ 轮 ≤5% 绿、熔断红', () => {
    const cards = kpiCards(metrics)
    expect(cards.find((c) => c.key === 'firstRound')).toMatchObject({ value: '75%', state: 'ok' })
    expect(cards.find((c) => c.key === 'fivePlus')).toMatchObject({ state: 'ok' })
    expect(cards.find((c) => c.key === 'breaker')).toMatchObject({ value: '正常', state: 'ok' })
    const bad = kpiCards({ ...metrics, firstRoundPassRate: 0.4, fivePlusShare: 0.2, breaker: { ...breaker, active: true } })
    expect(bad.find((c) => c.key === 'firstRound')?.state).toBe('warn')
    expect(bad.find((c) => c.key === 'fivePlus')?.state).toBe('warn')
    expect(bad.find((c) => c.key === 'breaker')?.state).toBe('warn')
  })

  it('档位表与案例行：轮次/发现/审批口径', () => {
    expect(tierRows(policy).map((t) => t.tier)).toEqual(['low', 'medium', 'high'])
    const row = caseRow(caseView, 3)
    expect(row).toMatchObject({ tierLabel: '中', roundText: '1/3', findingsText: '重要 1 · nit 0', approvalText: '0/1' })
  })

  it('未决发现按重要级排序，延后项不进未决', () => {
    const c: ReviewCaseView = {
      ...caseView,
      findings: [
        { ...caseView.findings[0], findingId: 'n1', severity: 'nit', body: 'nit' },
        { ...caseView.findings[0], findingId: 'i1', severity: 'important' },
        { ...caseView.findings[0], findingId: 'd1', severity: 'preexisting', deferred: true },
      ],
    }
    expect(openFindings(c).map((f) => f.findingId)).toEqual(['i1', 'n1'])
  })
})

describe('阶段页签注册', () => {
  it('每阶段键唯一、zh/en 成对；⑥治理含评审治理且默认签合法', () => {
    for (const stage of [1, 2, 3, 4, 5, 6] as const) {
      const tabs = STAGE_TABS[stage]
      expect(new Set(tabs.map((t) => t.key)).size).toBe(tabs.length)
      expect(tabs.every((t) => !!t.zh && !!t.en && !!t.component)).toBe(true)
      expect(resolveTab(stage, DEFAULT_TAB[stage])).toBe(DEFAULT_TAB[stage])
    }
    expect(STAGE_TABS[6].map((t) => t.key)).toContain('reviewGov')
  })
})

describe('ReviewGovPanel 渲染与动作', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.fetchPolicy.mockResolvedValue({ policy, breaker })
    mock.fetchCases.mockResolvedValue([caseView])
    mock.fetchMetrics.mockResolvedValue(metrics)
    mock.fetchCase.mockResolvedValue(detail)
    mock.recordApproval.mockResolvedValue(detail)
  })

  it('熔断状态、KPI、案例与未决发现如实渲染；选中案例拉详情', async () => {
    const w = mount(ReviewGovPanel)
    await flushPromises()
    expect(w.find('[data-testid="rg-breaker"]').text()).toContain('正常')
    expect(w.find('[data-testid="rg-kpi-firstRound"]').text()).toContain('75%')
    expect(w.find('[data-testid="rg-case-case-1"]').exists()).toBe(true)
    expect(w.find('[data-testid="rg-detail"]').text()).toContain('改缓存')
    expect(w.find('[data-testid="rg-finding-f1"]').text()).toContain('缓存穿透')
    expect(w.find('[data-testid="rg-readiness"]').text()).toContain('未就绪')
    expect(mock.fetchCase).toHaveBeenCalledWith('case-1')
    w.unmount()
  })

  it('记录人工审批调用 API，actorKind=human 且绑定当前提交', async () => {
    const w = mount(ReviewGovPanel)
    await flushPromises()
    const btn = w.findAll('button').find((b) => b.text().includes('记录我的审批'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()
    expect(mock.recordApproval).toHaveBeenCalledWith('case-1', expect.objectContaining({
      actorKind: 'human', decision: 'approve', commit: caseView.headCommit,
    }))
    w.unmount()
  })

  it('加载失败如实显示错误，不吞', async () => {
    mock.fetchPolicy.mockRejectedValue(new Error('503 fail-closed'))
    const w = mount(ReviewGovPanel)
    await flushPromises()
    expect(w.find('[data-testid="rg-error"]').text()).toContain('503')
    w.unmount()
  })
})
