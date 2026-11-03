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
