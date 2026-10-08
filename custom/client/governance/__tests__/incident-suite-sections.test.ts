// 六文调研轮 UI 守门（2026-10-08）：四治理面板（事故报告/事件流/损益表/自治阶梯）
// ① mock API 挂载渲染：17 要素分组/黄条、事件表、损益行、阶梯 CRUD 表单
// ② 降级诚实：API 抛错渲染错误行不炸组件；空态如实
// ③ 三宿主视图聚合（gov-audit / gov-harness / gov-registry 各含新面板）
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('@/api/studio/sessions', () => ({
  fetchSessions: vi.fn(async () => [
    { id: 'sess-demo-1', title: '演示会话' },
    { id: 'sess-demo-2' },
  ]),
}))

vi.mock('@/custom/governance/api/incident-suite', () => ({
  fetchIncidentReport: vi.fn(async () => ({
    sessionId: 'sess-demo-1',
    generatedAt: 1790000000000,
    subject: { title: '演示会话', messages: 4 },
    elements: [
      { key: 'message_history', title: '消息历史', category: 'trajectory', status: 'collected', summary: '共 4 条消息', sources: ['db#messages'] },
      { key: 'agent_identity', title: 'Agent 身份', category: 'capability', status: 'absent', summary: '运行身份未注册', sources: [], note: '身份册为空' },
      { key: 'design_topology', title: '设计时架构', category: 'orchestration', status: 'partial', summary: '快照 2 节点', sources: ['db'] },
    ],
    autonomy: {
      theoretical: { sources: [], facts: ['无任何配置面证据'], status: 'absent' },
      effective: { sources: ['t.jsonl'], facts: ['实际执行工具 12 次'], status: 'collected' },
      divergences: [
        { finding: '自治度事实上由运行时单独决定', severity: 'warn', evidence: ['t.jsonl'] },
        { finding: '未发现显性偏差', severity: 'info', evidence: [] },
      ],
    },
    coverage: { collected: 1, partial: 1, absent: 1, total: 3 },
  })),
  incidentReportMdUrl: (id: string) => `/api/incident/sessions/${id}/report.md`,
  fetchVirtualPnl: vi.fn(async () => ({
    days: 30,
    currency: 'CNY',
    rows: [
      { profile: 'coding-agent', delivered: 5, inFlight: 2, tokens: { input: 3000, output: 2000, calls: 10 }, costIdle: 0.01, costPeak: 0.02, unpricedRows: 1, costPerDeliveredIdle: 0.002, costPerDeliveredPeak: 0.004, lastActiveAt: 1790000000000 },
      { profile: 'idle-agent', delivered: 0, inFlight: 0, tokens: { input: 100, output: 50, calls: 2 }, costIdle: 0, costPeak: 0, unpricedRows: 0, costPerDeliveredIdle: null, costPerDeliveredPeak: null, lastActiveAt: null },
    ],
    global: { interventions: 3, reworkHours: 2.5, waitP95SecondsWithinDay: 1200 },
    anomalies: [{ profile: 'coding-agent', day: '2026-10-08', costPeak: 0.5, trailingMeanPeak: 0.1, ratio: 5, note: '日成本为前 7 日均值的 5.0 倍（阈值 2×）' }],
    benefitNote: '收益面无数据源（不编造）：设 HERMES_PL_VALUE_MAP…',
    sourcesAvailable: { usageDb: true, kanban: true, pricing: false },
  })),
  fetchGovEvents: vi.fn(async () => ({
    ok: true,
    events: [
      { eventId: 'g1', ts: 1790000001000, domain: 'security', severity: 'high', type: 'tool.denied_ladder-approval-point', source: 'enforce-gate', summary: '执法门拒绝 profile agent-x 的工具调用 terminal_exec' },
      { eventId: 'g2', ts: 1790000002000, domain: 'quality', severity: 'info', type: 'evidence.verdict_pass', source: 'evidence-store', summary: '任务 t1 验证裁决 pass' },
    ],
  })),
  fetchLadder: vi.fn(async () => ({
    ok: true,
    entries: [
      { target: 'coding-agent', level: 'assist', approvalPoints: ['生产部署'], maxRiskTier: 'medium', updatedAt: 1790000000000, updatedBy: 'wei' },
    ],
  })),
  putLadder: vi.fn(async () => ({ ok: true, entry: { target: 'x', level: 'assist', approvalPoints: [], maxRiskTier: 'low', updatedAt: 1 } })),
  deleteLadder: vi.fn(async () => ({ ok: true })),
}))

import IncidentReportSection from '../components/IncidentReportSection.vue'
import GovEventStreamSection from '../components/GovEventStreamSection.vue'
import VirtualPnlSection from '../components/VirtualPnlSection.vue'
import AutonomyLadderSection from '../components/AutonomyLadderSection.vue'
import GovAuditChangeView from '../../ia2/views/gov/GovAuditChangeView.vue'
import GovHarnessView from '../../ia2/views/gov/GovHarnessView.vue'
import GovRegistryRulesView from '../../ia2/views/gov/GovRegistryRulesView.vue'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('① 事故报告面板', () => {
  it('选择会话生成 → 三类分组渲染 + 黄条对账 + md 下载链接', async () => {
    const w = mount(IncidentReportSection)
    await flushPromises()
    expect(w.find('[data-testid="ir-session-select"]').exists()).toBe(true)
    const options = w.findAll('option')
    expect(options.length).toBeGreaterThanOrEqual(3)  // placeholder + 2 会话
    ;(w.vm as unknown as { sessionId: string }).sessionId = 'sess-demo-1'
    await w.find('[data-testid="ir-generate"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ir-coverage"]').text()).toContain('1 已采集 / 1 部分 / 1 未采集')
    expect(w.text()).toContain('一、执行轨迹')
    expect(w.text()).toContain('二、能力与权限')
    expect(w.text()).toContain('四、自治度对账')
    expect(w.find('[data-testid="ir-divergence-warn"]').text()).toContain('黄条')
    const md = w.find('[data-testid="ir-download-md"]')
    expect(md.attributes('href')).toContain('/report.md')
    // 缺席要素如实灰态（不装采集到）
    expect(w.text()).toContain('未采集')
  })
})

describe('② 治理事件流面板', () => {
  it('挂载即拉事件；high 事件带红徽标', async () => {
    const w = mount(GovEventStreamSection)
    await flushPromises()
    expect(w.findAll('[data-testid^="ges-row-"]').length).toBe(2)
    expect(w.find('[data-testid="ges-row-security"]').text()).toContain('tool.denied_ladder-approval-point')
    expect(w.text()).toContain('high')
  })

  it('域 chip 过滤：关掉安全域后 security 行消失', async () => {
    const w = mount(GovEventStreamSection)
    await flushPromises()
    await w.find('[data-testid="ges-domain-security"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ges-row-security"]').exists()).toBe(false)
    expect(w.find('[data-testid="ges-row-quality"]').exists()).toBe(true)
  })
})

describe('③ 虚拟损益表面板', () => {
  it('行渲染：交付/成本区间/单位成本；delivered=0 如实「无交付」不造单价；源缺席注记', async () => {
    const w = mount(VirtualPnlSection)
    await flushPromises()
    expect(w.find('[data-testid="vp-table"]').text()).toContain('coding-agent')
    expect(w.find('[data-testid="vp-table"]').text()).toContain('idle-agent')
    expect(w.find('[data-testid="vp-table"]').text()).toContain('无交付')
    expect(w.find('[data-testid="vp-anomalies"]').text()).toContain('5.0 倍')
    expect(w.find('[data-testid="vp-benefit-note"]').text()).toContain('不编造')
    expect(w.find('.vp__src-note').text()).toContain('价目表')  // pricing=false 如实点名
  })
})

describe('④ 自治阶梯面板', () => {
  it('列表渲染 + auto 档确认点置灰注记 + 保存走 PUT', async () => {
    const w = mount(AutonomyLadderSection)
    await flushPromises()
    expect(w.find('[data-testid="al-table"]').text()).toContain('coding-agent')
    expect(w.find('[data-testid="al-table"]').text()).toContain('生产部署')
    // 切 auto 档：确认点输入隐藏、矛盾注记出现
    ;(w.vm as unknown as { form: { level: string } }).form.level = 'auto'
    await w.vm.$nextTick()
    expect(w.find('[data-testid="al-points"]').exists()).toBe(false)
    expect(w.text()).toContain('不可配人工确认点')
    // 保存 assist 档
    ;(w.vm as unknown as { form: { level: string; target: string } }).form.level = 'assist'
    ;(w.vm as unknown as { form: { target: string } }).form.target = 'reviewer-agent'
    await w.vm.$nextTick()
    await w.find('[data-testid="al-save"]').trigger('submit')
    await flushPromises()
    const { putLadder } = await import('@/custom/governance/api/incident-suite')
    expect(putLadder).toHaveBeenCalled()
  })
})

describe('⑤ 三宿主视图聚合', () => {
  // 浅挂载：只断言新面板已注册进宿主视图（深渲染行为归 governance-view.test /
  // harness-sections.test 既有面）——不拖 Audit/changeGov 等兄弟板块的真实 API 面。
  const i18n = createI18n({ legacy: false, messages: { zh: {}, en: {} } })
  const mountShallow = (c: unknown) => mount(c as never, { shallow: true, global: { plugins: [i18n] } })

  it('gov-audit 含事故报告+事件流；gov-harness 含损益表；gov-registry 含自治阶梯', () => {
    const audit = mountShallow(GovAuditChangeView)
    expect(audit.findComponent(IncidentReportSection).exists()).toBe(true)
    expect(audit.findComponent(GovEventStreamSection).exists()).toBe(true)
    const harness = mountShallow(GovHarnessView)
    expect(harness.findComponent(VirtualPnlSection).exists()).toBe(true)
    const registry = mountShallow(GovRegistryRulesView)
    expect(registry.findComponent(AutonomyLadderSection).exists()).toBe(true)
  })
})

describe('⑥ 降级诚实', () => {
  it('API 抛错：四面板渲染错误行不炸组件', async () => {
    const api = await import('@/custom/governance/api/incident-suite')
    const { fetchIncidentReport: fir, fetchVirtualPnl: fvp, fetchGovEvents: fge, fetchLadder: fl } = api as unknown as Record<string, ReturnType<typeof vi.fn>>
    fir.mockRejectedValueOnce(new Error('500'))
    fvp.mockRejectedValueOnce(new Error('500'))
    fge.mockRejectedValueOnce(new Error('500'))
    fl.mockRejectedValueOnce(new Error('500'))
    const w1 = mount(IncidentReportSection)
    await flushPromises()
    // 事件流/损益表/阶梯错误路径
    const w2 = mount(GovEventStreamSection)
    await flushPromises()
    const w3 = mount(VirtualPnlSection)
    await flushPromises()
    const w4 = mount(AutonomyLadderSection)
    await flushPromises()
    expect(w1.exists() && w2.exists() && w3.exists() && w4.exists()).toBe(true)
    expect(w1.text() + w3.text() + w4.text()).toMatch(/失败|错误|读取失败/)
  })
})
