// 变更治理区组件守门（调研落地轮 2026-09-29）：
// ① 挂载渲染：管控基准 6 指标格 + 变更单表 + 冻结窗口块（mock API 全量供给）
// ② 交互链：新建表单创建并提交 → createChangeRequest+submitChangeRequest 被调
// ③ 冻结拦截消费面：freeze_violation 且 L2 的评审单渲染 override 勾选框
// ④ 降级诚实：API 抛错渲染 cg-error，不编造数据
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const api = await import('@/custom/governance/api/changeGov')

vi.mock('@/custom/governance/api/changeGov', () => ({
  fetchChangeGovMeta: vi.fn(async () => ({
    ok: true,
    levels: [
      { level: 1, key: 'L1', name: '重大/紧急', slaHours: 24, authority: '研发总监' },
      { level: 2, key: 'L2', name: '重要', slaHours: 48, authority: '项目经理' },
      { level: 3, key: 'L3', name: '一般', slaHours: 120, authority: '模块负责人' },
      { level: 4, key: 'L4', name: '微小', slaHours: 168, authority: '组内备案' },
    ],
    dimensions: ['schedule', 'cost', 'scope', 'quality', 'risk'],
    baselines: { monthlyNewMax: 100, emergencyRatioMax: 0.2, overdueReviewRatioMax: 0.08, reworkHoursMax: 180, freezePenetrationMax: 0.05, firstPassRateMin: 0.8 },
    freezeTiers: [{ tier: 1, name: '需求冻结' }, { tier: 2, name: '设计冻结' }, { tier: 3, name: '代码冻结' }],
  })),
  fetchChangeMetrics: vi.fn(async () => ({
    ok: true, month: '2026-09', submittedInMonth: 3,
    metrics: [
      { key: 'monthlyNew', actual: 3, baseline: 100, verdict: 'ok', detail: '当月提交 3 单' },
      { key: 'emergencyRatio', actual: 0.33, baseline: 0.2, verdict: 'warn', detail: '1/3 紧急' },
      { key: 'overdueReview', actual: 0, baseline: 0.08, verdict: 'ok', detail: '0/3 超决策时效' },
      { key: 'reworkHours', actual: 320, baseline: 180, verdict: 'over', detail: '已实施单合计 320h' },
      { key: 'freezePenetration', actual: 0.33, baseline: 0.05, verdict: 'over', detail: '1/3 穿透冻结窗口' },
      { key: 'firstPassRate', actual: 0.5, baseline: 0.8, verdict: 'warn', detail: '1/2 一次通过' },
    ],
  })),
  fetchChangeRequests: vi.fn(async () => ({
    ok: true,
    levels: [],
    items: [
      {
        id: 'cr-20260929-0001', title: '支付回调协议升级', description: '', source: '产品组', board: 'default', task_id: '',
        level: 2, emergency: false, impact: { schedule: 2, cost: 1, scope: 2, quality: 1, risk: 2 }, impact_total: 8,
        raci: { approver: ['@boss'] }, target_baseline: '', status: 'submitted',
        freeze_window_id: 'fw-1', freeze_violation: true, freeze_overridden: false, resubmit_count: 0,
        submitted_at: Date.now() - 3600_000, deadline_at: Date.now() + 47 * 3600_000,
        decided_at: null, decider: '', decision_note: '', rework_hours: 0,
        created_at: Date.now() - 7200_000, updated_at: Date.now() - 3600_000,
      },
      {
        id: 'cr-20260929-0002', title: '文案微调', description: '', source: '', board: '', task_id: '',
        level: 4, emergency: false, impact: { schedule: 0, cost: 0, scope: 1, quality: 0, risk: 0 }, impact_total: 1,
        raci: {}, target_baseline: '', status: 'draft',
        freeze_window_id: null, freeze_violation: false, freeze_overridden: false, resubmit_count: 0,
        submitted_at: null, deadline_at: null, decided_at: null, decider: '', decision_note: '', rework_hours: 0,
        created_at: Date.now() - 86400_000, updated_at: Date.now() - 86400_000,
      },
    ],
  })),
  fetchFreezeWindows: vi.fn(async () => ({
    ok: true,
    items: [{ id: 'fw-1', name: 'v0.8 发布冻结', tier: 3, starts_at: Date.now() - 3600_000, ends_at: Date.now() + 86400_000, scope: 'all', active: true, note: '', created_at: Date.now() }],
  })),
  createChangeRequest: vi.fn(async (input: { title: string }) => ({ ok: true, item: { id: 'cr-20260929-0003', title: input.title, status: 'draft' } })),
  updateChangeRequest: vi.fn(async () => { throw new Error('not used') }),
  submitChangeRequest: vi.fn(async () => ({ ok: true })),
  resubmitChangeRequest: vi.fn(async () => ({ ok: true })),
  decideChangeRequest: vi.fn(async () => ({ ok: true })),
  implementChangeRequest: vi.fn(async () => ({ ok: true })),
  createFreezeWindow: vi.fn(async () => ({ ok: true })),
  setFreezeWindowActive: vi.fn(async () => ({ ok: true })),
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: {} })

async function mountSection() {
  const { default: ChangeGovernanceSection } = await import('@/custom/governance/components/ChangeGovernanceSection.vue')
  return mount(ChangeGovernanceSection, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ChangeGovernanceSection 变更治理区', () => {
  it('渲染管控基准 6 指标格（实绩/基准/判定）+ 冻结窗口 + 变更单表', async () => {
    const w = await mountSection()
    await flushPromises()
    for (const k of ['monthlyNew', 'emergencyRatio', 'overdueReview', 'reworkHours', 'freezePenetration', 'firstPassRate']) {
      expect(w.find(`[data-testid="cg-metric-${k}"]`).exists(), k).toBe(true)
    }
    // over 判定样式落在返工工时与冻结穿透格上
    expect(w.find('[data-testid="cg-metric-reworkHours"]').classes()).toContain('cg-mcell--over')
    expect(w.find('[data-testid="cg-row-cr-20260929-0001"]').exists()).toBe(true)
    expect(w.find('[data-testid="cg-freeze-violation"]').exists()).toBe(true)
    expect(w.find('[data-testid="cg-freeze-row-fw-1"]').exists()).toBe(true)
    // L2 评审中且有 SLA 剩余时长
    expect(w.find('[data-testid="cg-row-cr-20260929-0001"]').text()).toContain('剩')
  })

  it('新建表单：填标题+五维 → 创建并提交走 create+submit 双调用', async () => {
    const w = await mountSection()
    await flushPromises()
    await w.find('[data-testid="cg-new"]').trigger('click')
    await w.find('[data-testid="cg-form-title"]').setValue('新增报表字段')
    await w.find('[data-testid="cg-form-impact-schedule"]').setValue('2')
    await w.find('[data-testid="cg-form-impact-risk"]').setValue('2')
    await w.find('[data-testid="cg-form-create-submit"]').trigger('click')
    await flushPromises()
    expect(api.createChangeRequest).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(api.createChangeRequest).mock.calls[0][0] as { title: string; impact: Record<string, number>; level: number }
    expect(payload.title).toBe('新增报表字段')
    expect(payload.impact.schedule).toBe(2)
    expect(payload.level).toBe(3) // Σ=4 → 建议 L3（≥4→L3、≥8→L2、紧急或 ≥11→L1）
    expect(api.submitChangeRequest).toHaveBeenCalledWith('cr-20260929-0003')
  })

  it('冻结穿透的 L2 评审单渲染 override 勾选框；通过按钮可点', async () => {
    const w = await mountSection()
    await flushPromises()
    const decideBox = w.find('[data-testid="cg-decide-cr-20260929-0001"]')
    expect(decideBox.exists()).toBe(true)
    expect(decideBox.text()).toContain('裁决穿透冻结窗口')
    await w.find('input[placeholder="决策人"]').setValue('研发总监')
    await w.find('[data-testid="cg-approve-cr-20260929-0001"]').trigger('click')
    await flushPromises()
    expect(api.decideChangeRequest).toHaveBeenCalledWith('cr-20260929-0001', expect.objectContaining({ decision: 'approve', decider: '研发总监', override_freeze: false }))
  })

  it('API 抛错降级：渲染错误条不编造', async () => {
    vi.mocked(api.fetchChangeRequests).mockRejectedValueOnce(new Error('boom'))
    const w = await mountSection()
    await flushPromises()
    expect(w.find('[data-testid="cg-error"]').exists()).toBe(true)
  })
})
