// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/mf-test-stats.test.ts
// M-F 守门：缺陷自动建（失败回执→parentId 挂原任务）、回归就绪判定、
// 统计投影各维度（项目/阶段/人员/Agent 负载与阻塞）、催办正负例、统计区 VTU。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import type { AssignContent, ReceiptContent, AgentDescriptor } from '../protocol'
import { buildDefectFromFailure, shouldAutoDefect, regressionReady, TEST_CAPABILITY } from '../test-execution'
import { assembleCards, projectStats, dueReminders } from '../stats'

const assign = (over: Partial<AssignContent> = {}): AssignContent => ({
  taskId: 't-1', title: '支付对账测试', target: { account: '@zhao:sv' },
  capability: [TEST_CAPABILITY], phase: 'P4', issuedBy: '@pm:sv', issuedAt: 1, ...over,
} as AssignContent)
const receipt = (status: ReceiptContent['status'], over: Partial<ReceiptContent> = {}): ReceiptContent =>
  ({ taskId: 't-1', status, reportedBy: '@zhao-agent:sv', reportedAt: 2, ...over })

// ── 测试执行链 ──
describe('缺陷自动建与回归就绪', () => {
  it('测试类任务 failed 回执 → 建缺陷：parentId 挂原任务、phase=P4、title 带原因、capability 去测试标签', () => {
    const original = assign()
    const failure = receipt('failed', { reason: '用例「弱网超时」未过' })
    expect(shouldAutoDefect(original, failure)).toBe(true)
    const defect = buildDefectFromFailure(original, failure, () => 'defect-1')
    expect(defect).toMatchObject({
      taskId: 'defect-1', parentId: 't-1', phase: 'P4', priority: '1',
      target: { account: '@zhao:sv' }, issuedBy: '@zhao-agent:sv',
    })
    expect(defect.title).toContain('[缺陷]')
    expect(defect.title).toContain('弱网超时')
    expect(defect.capability).toEqual([]) // test 标签已滤除
  })
  it('负例：非测试类任务 / 非 failed 回执 / 无回执 → 不建缺陷', () => {
    const dev = assign({ capability: ['coding'] })
    expect(shouldAutoDefect(dev, receipt('failed'))).toBe(false)
    expect(shouldAutoDefect(assign(), receipt('done'))).toBe(false)
    expect(shouldAutoDefect(assign(), null)).toBe(false)
  })
  it('回归就绪：全部缺陷终态 → true；有缺陷未闭合 → false；无缺陷 → false', () => {
    const original = assign()
    const mk = (id: string, status: ReceiptContent['status']) => ({
      assign: assign({ taskId: id, parentId: 't-1' }),
      receipt: receipt(status, { taskId: id }),
    })
    expect(regressionReady(original, [mk('d1', 'done'), mk('d2', 'failed')])).toBe(true)
    expect(regressionReady(original, [mk('d1', 'done'), mk('d2', 'running')])).toBe(false)
    expect(regressionReady(original, [])).toBe(false)
  })
})

// ── 统计投影 ──
const NOW = 2_000
const agents: AgentDescriptor[] = [
  { agentId: 'tester', agentType: 'test', capabilities: [TEST_CAPABILITY] },
  { agentId: 'coder', agentType: 'coding', capabilities: ['coding'] },
]

describe('projectStats 各维度', () => {
  const cards = assembleCards([
    assign({ dueAt: 300 }),                                          // t-1 测试 running（逾期）
    assign({ taskId: 't-2', phase: 'P3', parentId: 'case-9', target: { account: '@li:sv' }, capability: ['coding'], dueAt: 9_000 }),
    assign({ taskId: 't-3', phase: 'P3', parentId: 'case-9', target: { account: '@li:sv' }, capability: ['coding'] }),
    assign({ taskId: 't-4', parentId: 'case-9', target: { account: '@wang:sv' }, capability: ['coding'], phase: undefined }), // 无 phase → 归 '—'
  ], [
    receipt('running', { taskId: 't-1' }),
    receipt('done', { taskId: 't-2', reportedAt: 3 }),
    receipt('failed', { taskId: 't-3', reportedAt: 3 }),
    receipt('waiting-human', { taskId: 't-4', reportedAt: 3 }),
  ])
  it('总览与状态分布', () => {
    const s = projectStats(cards, agents, NOW)
    expect(s.total).toBe(4)
    expect(s.byStatus).toEqual({ running: 1, done: 1, blocked: 1, review: 1 })
    expect(s.blocked).toBe(1)
  })
  it('项目（案例代理）/阶段/人员维度', () => {
    const s = projectStats(cards, agents, NOW)
    expect(s.byCase.find(c => c.caseId === 'case-9')).toEqual({ caseId: 'case-9', total: 3, done: 1 })
    expect(s.byCase.find(c => c.caseId === '（独立）')?.total).toBe(1) // 仅 t-1（t-5 不在本夹具）
    expect(s.byPhase.find(p => p.phase === 'P3')).toEqual({ phase: 'P3', total: 2, done: 1 })
    expect(s.byPhase.find(p => p.phase === '—')?.total).toBe(1)
    const li = s.byAssignee.find(a => a.account === '@li:sv')
    expect(li).toMatchObject({ open: 1, done: 1, blocked: 1 })
  })
  it('Agent 负载：在途按标签归并（t-1 running→test:1；t-4 waiting→coding:1）', () => {
    const s = projectStats(cards, agents, NOW)
    expect(s.byAgent.find(a => a.agentId === 'tester')).toMatchObject({ running: 1 })
    expect(s.byAgent.find(a => a.agentId === 'coder')).toMatchObject({ running: 1 }) // t-4 waiting-human 占 coding 额度
  })
})

describe('dueReminders 催办正负例', () => {
  it('正例：dueAt<now 且非 done；负例：已 done、未到期、无 dueAt', () => {
    const cards = assembleCards([
      assign({ dueAt: 300 }),                                      // t-1 逾期 running
      assign({ taskId: 't-2', dueAt: 500 }),                       // t-2 逾期但无回执 → pending 仍催
      assign({ taskId: 't-3', dueAt: 500 }),                       // t-3 逾期已 done → 不催
      assign({ taskId: 't-4', dueAt: 9_000 }),                     // 未到期 → 不催
    ], [
      receipt('running', { taskId: 't-1' }),
      receipt('done', { taskId: 't-3', reportedAt: 3 }),
    ])
    // 单独构造 t-5（无 dueAt）
    const withNoDue = [...cards, { assign: assign({ taskId: 't-5' }), receipt: null }]
    const r = dueReminders(withNoDue, NOW)
    expect(r.map(x => x.taskId)).toEqual(['t-1', 't-2']) // 按到期升序（300 < 500）
    expect(r.every(x => x.status !== 'done')).toBe(true)
  })
})

// ── 统计区 VTU（mock 两 store；工厂内自建数据，规避 hoisting 限制）──
vi.mock('../stores/task-linkage', () => ({
  useTaskLinkageStore: () => ({
    cards: [{
      assign: {
        taskId: 't-1', title: '支付对账测试', target: { account: '@zhao:sv' },
        capability: ['test'], phase: 'P4', issuedBy: '@pm:sv', issuedAt: 1, dueAt: 500,
      },
      receipt: { taskId: 't-1', status: 'running', reportedBy: '@zhao-agent:sv', reportedAt: 2 },
    }],
  }),
}))
vi.mock('../stores/task-dispatch', () => ({
  useTaskDispatchStore: () => ({ localAgents: [{ agentId: 'tester', agentType: 'test', capabilities: ['test'] }] }),
}))

import GovStatsSection from '../../ia2/components/gov/GovStatsSection.vue'

describe('GovStatsSection VTU', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('逾期清单 + 四维卡片渲染', () => {
    const w = mount(GovStatsSection, { global: { plugins: [] } })
    expect(w.find('[data-testid="gov-stats-overdue"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-reminder-t-1"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-stats-agent-tester"]').text()).toContain('tester')
    expect(w.find('[data-testid="gov-stats-assignee-@zhao:sv"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-stats-phase-P4"]').exists()).toBe(true)
  })
})
