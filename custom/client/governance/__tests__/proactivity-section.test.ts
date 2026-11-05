// ProactivitySection UI 守门（挂账清偿批）：矩阵渲染（服务端 caps）、策略 CRUD、
// 对齐确认（漂移复位）、演算器结果呈现、API 抛错降级诚实。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/custom/governance/api/incident-suite', () => ({
  fetchProactivityModel: vi.fn(async () => ({
    axes: {
      problemDefiner: ['L1', 'L2', 'L3', 'L4', 'L5'].map((level) => ({ level, title: level, definer: '', example: '' })),
      actionTier: ['inform', 'suggest', 'draft', 'reversible_exec', 'irreversible_exec'].map((tier) => ({ tier, title: tier })),
    },
    rules: ['r1', 'r2', 'r3', 'r4'],
    alignmentPolicy: { maxConfirmAgeDays: 7, neverConfirmedGraceDays: 1 },
    caps: [
      { level: 'L1', noContract: 'irreversible_exec', withContract: 'irreversible_exec' },
      { level: 'L4', noContract: 'draft', withContract: 'irreversible_exec' },
      { level: 'L5', noContract: 'inform', withContract: 'inform' },
    ],
    executionFace: 'test',
  })),
  fetchProactivityPolicies: vi.fn(async () => ({
    ok: true,
    entries: [
      { profile: 'coding-agent', level: 'L4', contract: { goalExplicit: true, acceptanceCriteria: false }, goalId: 'milestone:m1', updatedAt: 1, resolved: { level: 'L4', goalStatus: 'stale' } },
      { profile: 'watcher', level: 'L5', updatedAt: 2, resolved: { level: 'L5' } },
    ],
  })),
  fetchProactivityAlignments: vi.fn(async () => ({
    ok: true,
    entries: [
      {
        goalId: 'milestone:m1', goalSummary: '把里程碑推到上线', createdAt: 1,
        confirmations: [{ at: 1, by: 'alice' }],
        status: { status: 'stale', lastConfirmedAt: 1, daysSinceConfirm: 9.2, reason: '距上次确认 9.2 天' },
      },
    ],
  })),
  fetchBreakpoint: vi.fn(async () => ({
    ok: true,
    available: true,
    boards: 1,
    atBreakpoint: false,
    nextBreakpointAtMs: 1730000600000,
    reasonCode: 'mid_flow',
    detail: '工作流中途（最近事件 1 分钟前）——按历史节奏推测下次断点约在 10 分钟后',
    evidence: { eventsConsidered: 12, lastEventAgeSec: 60, lastBoundaryAgeSec: 600, medianGapSec: 600, activeStream: true },
  })),
  fetchAttentionPrefs: vi.fn(async () => ({
    ok: true,
    prefs: { quietHours: { startHour: 21, endHour: 7 }, dailyBudget: 5, hourlyBudget: 2, cooldownMinutes: 20, rejectionBackoffHours: 8, minScore: 0.15 },
    defaults: { quietHours: { startHour: 22, endHour: 8 }, dailyBudget: 8, hourlyBudget: 3, cooldownMinutes: 30, rejectionBackoffHours: 12, minScore: 0.2 },
    file: '/tmp/attention.json',
  })),
  fetchProactivityScorecard: vi.fn(async () => ({
    ok: true,
    scorecard: {
      task: { accepted: 3, acceptedWithEffect: 2, acceptanceRate: 0.6 },
      mechanism: { decisions: { deliver: 5, defer: 2, batch: 1, suppress: 4, escalate: 1 }, suppressed: 4, deferred: 2, batched: 1, escalated: 1, quietHoursDefers: 2, budgetDefers: 1, deferralAging: 1 },
      user: { interruptions: 5, accepted: 3, rejected: 1, ignored: 1, modified: 0, takeover: 0, snoozed: 0, acceptanceRate: 0.6, ignoreRate: 0.2, retractionRate: 0, trustGap: 0.6, quietHoursBlocked: 2, budgetCapped: 1 },
      note: '指标度量系统行为，不是真人满意度',
    },
    calibration: [],
  })),
  fetchInterventions: vi.fn(async () => ({
    ok: true,
    interventions: [
      { id: 'iv-1', surface: 'suggestion', severity: 'attention', audience: 'human', topicKey: 'unblock-blocked:c1', summary: '卡点任务待确认', decision: 'deliver', reasonCode: 'budget_ok', reasons: ['预算与冷却均有余量'], score: 0.5, decidedAtMs: 1730000000000, outcome: null },
    ],
  })),
  putAttentionPrefs: vi.fn(async (p: { dailyBudget: number }) => ({ ok: true, prefs: p })),
  syncInterventions: vi.fn(async () => ({ ok: true, available: true, created: 2, skipped: 1, byDecision: { deliver: 2 } })),
  postInterventionFeedback: vi.fn(async () => ({ ok: true })),
  putProactivityPolicy: vi.fn(async () => ({ ok: true, entry: { profile: 'new-agent', level: 'L3', updatedAt: 3 } })),
  deleteProactivityPolicy: vi.fn(async () => ({ ok: true })),
  confirmProactivityAlignment: vi.fn(async () => ({ ok: true, entry: {} })),
  postProactivityAlignment: vi.fn(async () => ({ ok: true, entry: {} })),
  assessProactivity: vi.fn(async () => ({
    ok: true,
    assessment: { allowed: false, cappedAt: 'draft', reasons: ['L4 无契约上限起草'] },
    upgrade: { note: '补验收规则' },
    failureCostTier: 'low',
    goalStatus: null,
  })),
}))

import ProactivitySection from '../components/ProactivitySection.vue'
import {
  assessProactivity,
  confirmProactivityAlignment,
  deleteProactivityPolicy,
  fetchAttentionPrefs,
  fetchProactivityModel,
  postInterventionFeedback,
  putAttentionPrefs,
  putProactivityPolicy,
  syncInterventions,
} from '@/custom/governance/api/incident-suite'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProactivitySection', () => {
  it('矩阵按服务端 caps 渲染：L5 不可逆=限、L4 有契约上限=不可逆执行', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    expect(w.find('[data-testid="pa-matrix"]').exists()).toBe(true)
    expect(w.find('[data-testid="pa-cell-L5-irreversible_exec"]').classes()).toContain('is-capped')
    expect(w.find('[data-testid="pa-cell-L1-irreversible_exec"]').classes()).toContain('is-allowed')
    expect(w.text()).toContain('不可逆执行')
  })

  it('策略表渲染解析态（stale）＋对齐台账渲染＋重新确认调用 API', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    expect(w.find('[data-testid="pa-policy-table"]').text()).toContain('coding-agent')
    expect(w.find('[data-testid="pa-status-milestone:m1"]').text()).toContain('已过期待确认')
    await w.find('[data-testid="pa-confirm-milestone:m1"]').trigger('click')
    await flushPromises()
    expect(confirmProactivityAlignment).toHaveBeenCalledWith('milestone:m1', expect.any(String))
    expect(w.find('[data-testid="pa-msg"]').text()).toContain('milestone:m1')
  })

  it('策略保存带契约与关联目标', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    const form = (w.vm as unknown as { policyForm: { profile: string; level: string; goalExplicit: boolean; acceptanceCriteria: boolean; goalId: string } }).policyForm
    form.profile = 'new-agent'
    form.level = 'L3'
    form.goalExplicit = true
    form.acceptanceCriteria = true
    form.goalId = 'milestone:m1'
    await w.find('[data-testid="pa-policy-form"]').trigger('submit')
    await flushPromises()
    expect(putProactivityPolicy).toHaveBeenCalledWith('new-agent', {
      level: 'L3',
      contract: { goalExplicit: true, acceptanceCriteria: true },
      goalId: 'milestone:m1',
    })
  })

  it('演算器呈现服务端裁决与升仓建议', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    await w.find('[data-testid="pa-assess-form"]').trigger('submit')
    await flushPromises()
    expect(assessProactivity).toHaveBeenCalled()
    expect(w.find('[data-testid="pa-assess-result"]').text()).toContain('受限')
    expect(w.find('[data-testid="pa-assess-result"]').text()).toContain('补验收规则')
  })

  it('API 抛错降级诚实（错误行不炸组件）', async () => {
    ;(fetchProactivityModel as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    const w = mount(ProactivitySection)
    await flushPromises()
    expect(w.find('[data-testid="pa-error"]').text()).toContain('boom')
  })

  it('策略移除调用 API 并刷新', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    await w.find('[data-testid="pa-policy-del-coding-agent"]').trigger('click')
    await flushPromises()
    expect(deleteProactivityPolicy).toHaveBeenCalledWith('coding-agent')
  })
})

// 介入治理（注意力轴，2026-11-03）：三层计分卡渲染、干预列表反馈、偏好保存。
describe('介入治理区', () => {
  it('三层计分卡与干预列表渲染；反馈按钮调用端点', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    expect(w.find('[data-testid="pa-scorecard"]').exists()).toBe(true)
    expect(w.text()).toContain('打扰 5 次')
    expect(w.text()).toContain('接受率 60.0%')
    expect(w.find('[data-testid="pa-interventions"]').exists()).toBe(true)
    expect(w.text()).toContain('预算与冷却均有余量')

    await w.find('[data-testid="pa-iv-accept-iv-1"]').trigger('click')
    await flushPromises()
    expect(postInterventionFeedback).toHaveBeenCalledWith('iv-1', 'accepted')
  })

  it('保存偏好调用 PUT；同步建议调用 POST 并提示结果', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    await w.find('[data-testid="pa-att-save"]').trigger('click')
    await flushPromises()
    expect(putAttentionPrefs).toHaveBeenCalled()
    const payload = (putAttentionPrefs as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { dailyBudget: number; hourlyBudget: number }
    expect(payload.dailyBudget).toBe(5)
    expect(payload.hourlyBudget).toBe(2)

    await w.find('[data-testid="pa-att-sync"]').trigger('click')
    await flushPromises()
    expect(syncInterventions).toHaveBeenCalled()
    expect(w.text()).toContain('同步完成')
  })

  it('只读态隐藏偏好保存、同步与反馈按钮，计分卡仍呈现', async () => {
    const w = mount(ProactivitySection, { props: { readonly: true } })
    await flushPromises()
    expect(w.find('[data-testid="pa-scorecard"]').exists()).toBe(true)
    expect(w.find('[data-testid="pa-att-save"]').exists()).toBe(false)
    expect(w.find('[data-testid="pa-att-sync"]').exists()).toBe(false)
    expect(w.find('[data-testid="pa-iv-accept-iv-1"]').exists()).toBe(false)
  })
})

// 安静时段单源交互面守门（审查 Minor 3/4，P0 Task 8 round 2）：
// 嵌套 quietHours 是唯一数据源——开关派生、输入经 computed 读写嵌套对象、
// 保存载荷形状（开=嵌套对象/关=null）、畸形重载不得残留旧值。
describe('介入治理区——安静时段单源交互面', () => {
  function lastPrefsPayload(): { quietHours: { startHour: number; endHour: number } | null } {
    const call = (putAttentionPrefs as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)
    return call?.[0] as { quietHours: { startHour: number; endHour: number } | null }
  }

  it('加载派生开关与输入值：quietHours 在案=开关勾选，输入绑定嵌套 start/end', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    expect((w.find('[data-testid="pa-att-quiet-enabled"]').element as HTMLInputElement).checked).toBe(true)
    expect((w.find('[data-testid="pa-att-start"]').element as HTMLInputElement).value).toBe('21')
    expect((w.find('[data-testid="pa-att-end"]').element as HTMLInputElement).value).toBe('7')
    expect(w.find('[data-testid="pa-att-start"]').attributes('disabled')).toBeUndefined()
  })

  it('关开关即清 null 并禁用输入；保存载荷 quietHours=null（开关是唯一数据源的写入口）', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    await w.find('[data-testid="pa-att-quiet-enabled"]').setValue(false)
    expect(w.find('[data-testid="pa-att-start"]').attributes('disabled')).toBeDefined()
    await w.find('[data-testid="pa-att-save"]').trigger('click')
    await flushPromises()
    expect(lastPrefsPayload().quietHours).toBeNull()
  })

  it('关后重开以缺省 22–8 落对象；改值经 computed 写嵌套源，保存载荷为嵌套形状', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    await w.find('[data-testid="pa-att-quiet-enabled"]').setValue(false)
    await w.find('[data-testid="pa-att-quiet-enabled"]').setValue(true)
    expect((w.find('[data-testid="pa-att-start"]').element as HTMLInputElement).value).toBe('22')
    expect((w.find('[data-testid="pa-att-end"]').element as HTMLInputElement).value).toBe('8')
    await w.find('[data-testid="pa-att-start"]').setValue('23')
    await w.find('[data-testid="pa-att-end"]').setValue('6')
    await w.find('[data-testid="pa-att-save"]').trigger('click')
    await flushPromises()
    expect(lastPrefsPayload().quietHours).toEqual({ startHour: 23, endHour: 6 })
  })

  it('畸形重载（quietHours 键缺席）不得残留旧值：保存载荷必须 null（Minor 4）', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    // 先正常加载（quietHours 21–7 在案），再以键缺席的畸形 prefs 强制重载（经同步建议触发 loadAttention）
    ;(fetchAttentionPrefs as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      prefs: { dailyBudget: 5, hourlyBudget: 2, cooldownMinutes: 20, rejectionBackoffHours: 8, minScore: 0.15 },
      defaults: { quietHours: { startHour: 22, endHour: 8 }, dailyBudget: 8, hourlyBudget: 3, cooldownMinutes: 30, rejectionBackoffHours: 12, minScore: 0.2 },
      file: '/tmp/attention.json',
    })
    await w.find('[data-testid="pa-att-sync"]').trigger('click')
    await flushPromises()
    expect((w.find('[data-testid="pa-att-quiet-enabled"]').element as HTMLInputElement).checked).toBe(false)
    await w.find('[data-testid="pa-att-save"]').trigger('click')
    await flushPromises()
    expect(lastPrefsPayload().quietHours).toBeNull()
  })
})

// 断点推断展示（2026-11-03 断点适配器）：有信号就显示状态与理由，不可用如实降级。
describe('断点推断展示', () => {
  it('非断点态显示「当前非断点」与理由文本', async () => {
    const w = mount(ProactivitySection)
    await flushPromises()
    const el = w.find('[data-testid="pa-breakpoint"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('当前非断点')
    expect(el.text()).toContain('mid_flow')
    expect(el.text()).toContain('推测下次断点')
  })
})
