// @vitest-environment jsdom
// 组织治理三区块渲染守门（2026-11-05）：自治刻度 / 假设登记簿 / 度量纪律。
// 目的：SFC 能编译并渲染关键结构（配比条/违规标记/缺停止条件/缺口文案/装饰清单/
// 阶段比例），且缺口态不被渲染成 0。数据面全部 mock——真实端点形状由服务端
// http-projection.test.ts 覆盖，二者互补（一层渲染、一层契约）。
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({
  fetchAutonomyScale: vi.fn(),
  putAutonomyScale: vi.fn(),
  deleteAutonomyScale: vi.fn(),
  fetchAutonomyDistribution: vi.fn(),
  checkDualSign: vi.fn(),
  fetchRosterGaps: vi.fn(),
  fetchPremises: vi.fn(),
  createPremise: vi.fn(),
  refutePremise: vi.fn(),
  fetchPremiseDue: vi.fn(),
  fetchPremiseImpact: vi.fn(),
  fetchReeval: vi.fn(),
  resolveReeval: vi.fn(),
  fetchCoreMetrics: vi.fn(),
  fetchDecorativeMetrics: vi.fn(),
  fetchMetricAudit: vi.fn(),
  fetchDecisionStageRatios: vi.fn(),
}))

vi.mock('@/custom/governance/api/org-governance', () => api)

const ENTRY_OK = {
  target: 'worker-coder',
  al: 2,
  dod: { criteria: ['产物可直接进构建'], sample: '历史样例', stopCondition: '采纳率低于 60% 停用' },
  auditSampling: 0.1,
  humanScan: true,
  reviewedAt: 1_760_000_000_000,
  assessment: { target: 'worker-coder', al: 2, tier: 'collab', verdict: 'ok', findings: [], fakeAi: false },
}

const ENTRY_FAKE = {
  target: 'worker-tester',
  al: 4,
  dod: { criteria: ['可直接用'], sample: '样例', stopCondition: '' },
  auditSampling: 0,
  humanScan: false,
  reviewedAt: 1_760_000_000_000,
  assessment: { target: 'worker-tester', al: 4, tier: 'auto', verdict: 'blocked', findings: [], fakeAi: true },
}

beforeEach(() => {
  for (const fn of Object.values(api)) (fn as ReturnType<typeof vi.fn>).mockReset()
})

describe('AutonomyScaleSection', () => {
  it('渲染三圈配比、表格、缺停止条件标记与户口缺口', async () => {
    api.fetchAutonomyScale.mockResolvedValue({ ok: true, entries: [ENTRY_OK, ENTRY_FAKE] })
    api.fetchAutonomyDistribution.mockResolvedValue({
      ok: true,
      report: {
        total: 2,
        counts: { auto: 1, collab: 1, human: 0 },
        shares: { auto: 0.5, collab: 0.5, human: 0 },
        verdicts: { ok: 1, warn: 0, blocked: 1 },
        reference: { auto: 0.8, collab: 0.15, human: 0.05 },
        checks: [{ id: 'no-autonomy', verdict: 'warn', detail: '无自主圈配置——有治理框架，无授权' }],
      },
    })
    api.fetchRosterGaps.mockResolvedValue({
      ok: true, total: 2, blocked: 1,
      rows: [{ id: 'aid-001', name: 'worker-coder', kind: 'agent', status: 'blocked', gaps: [{ field: 'audit-requirement', detail: '缺审计要求（抽样比例）——凭证可撤销不等于有审计' }] }],
    })
    const { default: C } = await import('../components/AutonomyScaleSection.vue')
    const w = mount(C)
    await flushPromises()

    expect(w.find('[data-testid="autonomy-scale-section"]').exists()).toBe(true)
    expect(w.find('[data-testid="as-distribution"]').text()).toContain('自主圈 1')
    const table = w.find('[data-testid="as-table"]').text()
    expect(table).toContain('worker-coder')
    expect(table).toContain('缺停止条件')
    expect(table).toContain('无人工扫描')
    // 假 AI 化显式列出（不是只染色）
    expect(w.find('[data-testid="as-gaps"]').text()).toContain('判假 AI 化')
    expect(w.find('[data-testid="as-roster"]').text()).toContain('缺审计要求')
    // 退化自检文案来自服务端
    expect(w.find('[data-testid="as-distribution"]').text()).toContain('无授权')
  })

  it('空台账时给「未治理」判词，不给绿', async () => {
    api.fetchAutonomyScale.mockResolvedValue({ ok: true, entries: [] })
    api.fetchAutonomyDistribution.mockResolvedValue({
      ok: true,
      report: { total: 0, counts: { auto: 0, collab: 0, human: 0 }, shares: { auto: 0, collab: 0, human: 0 }, verdicts: { ok: 0, warn: 0, blocked: 0 }, reference: { auto: 0.8, collab: 0.15, human: 0.05 }, checks: [{ id: 'no-data', verdict: 'warn', detail: '无自治配置——任何「已治理」的结论都不成立' }] },
    })
    api.fetchRosterGaps.mockResolvedValue({ ok: true, total: 0, blocked: 0, rows: [] })
    const { default: C } = await import('../components/AutonomyScaleSection.vue')
    const w = mount(C)
    await flushPromises()
    expect(w.text()).toContain('未登记自治刻度时')
    expect(w.text()).toContain('不成立')
  })
})

describe('PremiseLogSection', () => {
  it('渲染台账、到期队列与重评队列', async () => {
    api.fetchPremises.mockResolvedValue({
      ok: true,
      entries: [{
        id: 'pr-20261105-0001',
        statement: '客户续费率在 2027 年 Q1 低于 80%',
        kind: 'market',
        scope: ['2026-11-05-org-governance-autonomy-scale.md'],
        reviewAt: 1_760_000_000_000,
        status: 'hold',
        confidence: 'medium',
        createdAt: 1_759_000_000_000,
        createdBy: 'tester',
        updatedAt: 1_759_000_000_000,
      }],
      kinds: [],
    })
    api.fetchPremiseDue.mockResolvedValue({
      ok: true,
      now: 1_760_000_000_000,
      rows: [{ premise: { id: 'pr-20261105-0001', statement: '客户续费率在 2027 年 Q1 低于 80%' }, overdueDays: 3 }],
    })
    api.fetchReeval.mockResolvedValue({
      ok: true,
      items: [{ id: 're-1', premiseId: 'pr-20261105-0001', anchors: ['a.md'], reason: '假设被推翻', queuedAt: 1_760_000_000_000, state: 'queued' }],
    })
    const { default: C } = await import('../components/PremiseLogSection.vue')
    const w = mount(C)
    await flushPromises()

    expect(w.find('[data-testid="premise-log-section"]').exists()).toBe(true)
    expect(w.find('[data-testid="pl-table"]').text()).toContain('续费率')
    expect(w.find('[data-testid="pl-due"]').text()).toContain('逾期 3 天')
    expect(w.find('[data-testid="pl-reeval"]').text()).toContain('假设被推翻')
    // 关闭理由必填的提示必须在界面上（不是只写在服务端）
    expect(w.find('[data-testid="pl-reeval"]').text()).toContain('无理由关闭')
  })

  it('空台账给「还没有可被推翻的判断」判词', async () => {
    api.fetchPremises.mockResolvedValue({ ok: true, entries: [], kinds: [] })
    api.fetchPremiseDue.mockResolvedValue({ ok: true, now: 0, rows: [] })
    api.fetchReeval.mockResolvedValue({ ok: true, items: [] })
    const { default: C } = await import('../components/PremiseLogSection.vue')
    const w = mount(C)
    await flushPromises()
    expect(w.text()).toContain('假设清单')
  })
})

describe('MetricDisciplineSection', () => {
  it('缺口态显示 gap 文案而不是 0；装饰清单带判据句；阶段比例可读', async () => {
    api.fetchCoreMetrics.mockResolvedValue({
      ok: true,
      readings: [
        { key: 'measure/autonomy-rate', title: '自主运营比例', value: null, unit: '', sample: 0, available: false, gap: '自治刻度未配置——先登记 AL 等级才谈得上自主运营比例', definition: 'AL>=4 目标承接任务数 / 已派发任务总数', sources: [] },
        { key: 'measure/human-minutes-per-task', title: '单任务人时', value: 42.5, unit: '分钟', sample: 12, available: true, definition: '中位数 / 60', sources: [] },
      ],
      skillUsage: { available: false, coverage: null, declared: 0, total: 0, top: [], gap: '未找到看板库或任务创建事件' },
    })
    api.fetchDecorativeMetrics.mockResolvedValue({
      ok: true,
      entries: [{ key: 'measure/rework-rate', title: '返工率', definition: 'x / y', namespace: 'measure', judgement: '过去一个季度，有哪个决策因为这个数字而改变？答不出即装饰' }],
    })
    api.fetchMetricAudit.mockResolvedValue({
      ok: true,
      rows: [{ key: 'measure/rework-rate', decorative: true, issues: [{ severity: 'warn', code: 'empty-consumers', detail: '无消费者决策' }] }],
      errorCount: 0,
      decorativeCount: 1,
      namespaces: { measure: 6, settle: 0 },
    })
    api.fetchDecisionStageRatios.mockResolvedValue({
      ok: true,
      total: 12,
      kgAvailable: true,
      ratios: { available: true, designShare: 0.25, vetoRate: 0.1, distribution: { design: 3 }, staged: 12, unstaged: 0 },
    })
    const { default: C } = await import('../components/MetricDisciplineSection.vue')
    const w = mount(C)
    await flushPromises()

    const core = w.find('[data-testid="md-core"]').text()
    expect(core).toContain('自主运营比例')
    // 缺口态：显示 — 与 gap 文案，不显示 0
    expect(core).toContain('—')
    expect(core).toContain('自治刻度未配置')
    expect(core).toContain('42.5 分钟')

    expect(w.find('[data-testid="md-decorative"]').text()).toContain('哪个决策')
    const stage = w.find('[data-testid="md-stage"]').text()
    expect(stage).toContain('25.0%')
    expect(stage).toContain('10.0%')
    expect(w.text()).toContain('缺阶段 0 条')
  })

  it('决策图谱不可用时不把读数当成立', async () => {
    api.fetchCoreMetrics.mockResolvedValue({ ok: true, readings: [], skillUsage: { available: false, coverage: null, declared: 0, total: 0, top: [], gap: '无' } })
    api.fetchDecorativeMetrics.mockResolvedValue({ ok: true, entries: [] })
    api.fetchMetricAudit.mockResolvedValue({ ok: true, rows: [], errorCount: 0, decorativeCount: 0, namespaces: { measure: 0, settle: 0 } })
    api.fetchDecisionStageRatios.mockResolvedValue({
      ok: true, total: 0, kgAvailable: false,
      ratios: { available: false, designShare: null, vetoRate: null, distribution: {}, staged: 0, unstaged: 0 },
    })
    const { default: C } = await import('../components/MetricDisciplineSection.vue')
    const w = mount(C)
    await flushPromises()
    expect(w.find('[data-testid="md-stage"]').text()).toContain('决策图谱不可用')
  })
})
