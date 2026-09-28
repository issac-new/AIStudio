// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/task-flow-timeline.test.ts
// P4③ 任务流转时间线守门（2026-09-28 §五）：TaskDecisionPanel 新增「任务流转」节——
// 有事件渲染+计数徽章+点任务号上抛 open-task；无事件/未传 prop 不渲染（向后兼容）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }) }))

import TaskDecisionPanel from '../components/flow/TaskDecisionPanel.vue'
import TaskFlowTimeline from '../components/flow/TaskFlowTimeline.vue'
import type { TaskFlowEvent } from '@/custom/matrix-chat/utils/task-flow'

const EVENTS: TaskFlowEvent[] = [
  { ts: 1000, actor: 'fanfan', action: 'dispatch', taskId: 't_ab12cd', mentions: ['chen-agent'], summary: '派发系分任务' },
  { ts: 2000, actor: 'chen-agent', action: 'receipt', taskId: 'RFD-001', mentions: ['fanfan-agent'], summary: '【完成回执】RFD-001 已完成' },
  { ts: 3000, actor: 'fei-agent', action: 'defect', taskId: 'TEST-FE', mentions: [], summary: '【缺陷】TEST-FE 占位渠道未拦截' },
]

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('P4③ 任务流转时间线', () => {
  it('TaskDecisionPanel：有 flowEvents 渲染「任务流转」节+计数；缺省不渲染', () => {
    const withFlow = mount(TaskDecisionPanel, {
      props: { waitItems: [], linkedTasks: [], feedRows: [], flowEvents: EVENTS },
    })
    expect(withFlow.find('[data-testid="tdp-flow-sec"]').exists()).toBe(true)
    expect(withFlow.find('[data-testid="tdp-flow-sec"]').text()).toContain('3')

    const without = mount(TaskDecisionPanel, {
      props: { waitItems: [], linkedTasks: [], feedRows: [] },
    })
    expect(without.find('[data-testid="tdp-flow-sec"]').exists()).toBe(false)
  })

  it('TaskFlowTimeline：三类事件行渲染（图标/操作人/任务号/提及），倒序展示', () => {
    const w = mount(TaskFlowTimeline, { props: { events: EVENTS } })
    expect(w.find('[data-testid="tft-defect"]').exists()).toBe(true)
    expect(w.find('[data-testid="tft-receipt"]').exists()).toBe(true)
    expect(w.find('[data-testid="tft-dispatch"]').exists()).toBe(true)
    // 倒序：最新（defect ts=3000）在最上
    const first = w.findAll('.tft__row')[0]
    expect(first.attributes('data-testid')).toBe('tft-defect')
    expect(w.text()).toContain('fanfan')
    expect(w.text()).toContain('@chen-agent')
  })

  it('点任务号上抛 open-task（装配层跳看板抽屉）', async () => {
    const w = mount(TaskFlowTimeline, { props: { events: EVENTS } })
    await w.find('[data-testid="tft-task-t_ab12cd"]').trigger('click')
    expect(w.emitted('open-task')?.[0]).toEqual(['t_ab12cd'])
  })

  it('面板行点击链路：open-task 透传到 TaskDecisionPanel emits', async () => {
    const w = mount(TaskDecisionPanel, {
      props: { waitItems: [], linkedTasks: [], feedRows: [], flowEvents: EVENTS },
    })
    await w.find('[data-testid="tft-task-RFD-001"]').trigger('click')
    expect(w.emitted('open-task')?.[0]).toEqual(['RFD-001'])
  })

  it('空事件渲染空态文案', () => {
    const w = mount(TaskFlowTimeline, { props: { events: [] } })
    expect(w.text()).toContain('ia2.tdp.flowEmpty')
  })
})
