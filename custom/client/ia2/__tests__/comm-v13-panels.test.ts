// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/comm-v13-panels.test.ts
// v13 面板守门：右栏「需关注」节（TaskDecisionPanel + AttentionList——attention
// 档行渲染/计数徽章/空态/点击上抛）与左栏循环行运行脉冲（FlowNavPanel——
// loopActivity 投影的 ●N 呼吸点，无活动不渲染）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }) }))

import TaskDecisionPanel from '../components/flow/TaskDecisionPanel.vue'
import FlowNavPanel from '../components/flow/FlowNavPanel.vue'
import type { AttentionRow } from '../adapters/overview'
import type { FlowLoopRow, FlowSessionRow } from '../adapters/flow'

const NOW = Date.now()

// 行模型=overview.AttentionRow（2026-10-03 裁决 B 单一装配；2026-10-10 AttentionList
// 迁移对齐——此前测试仍锚旧 activity 模型 subKey 字段，与现实装配脱节）
function attRow(over: Partial<AttentionRow> & { id: string }): AttentionRow {
  return { taskId: '', kind: 'task', title: `t-${over.id}`, status: 'blocked', severity: 'high', priority: 3, createdAt: NOW - 600_000, ...over }
}

const BASE_PANEL_PROPS = {
  waitItems: [],
  linkedTasks: [],
  feedRows: [],
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('TaskDecisionPanel — v13 需关注（并入「待我处理」节，UX 裁决 D）', () => {
  it('有行时并入待我处理徽标（等我+需关注合计）+ 行渲染（副文 i18n + 等待时长）；行点击上抛 open-attention', async () => {
    const w = mount(TaskDecisionPanel, {
      props: {
        ...BASE_PANEL_PROPS,
        attentionRows: [
          attRow({ id: 'task:t1', kind: 'task', status: 'blocked', taskId: 't1' }),
          attRow({ id: 'run:r9', kind: 'run', status: 'review', severity: 'medium' }),
        ],
      },
    })
    expect(w.find('[data-testid="attention-list"]').exists()).toBe(true)
    // 裁决 D：徽标=待我处理合计（本例 waitItems 空 + 需关注 2 = 2），旧 --warn 独立徽标退役
    expect(w.find('.tdp__n').text()).toBe('2')
    expect(w.find('[data-testid="att-task:t1"]').text()).toContain('ia2.att.subTaskBlocked')
    expect(w.find('[data-testid="att-task:t1"]').text()).toContain('10m')
    await w.find('[data-testid="att-run:r9"]').trigger('click')
    const emitted = w.emitted('open-attention')
    expect(emitted).toHaveLength(1)
    expect(emitted![0][0]).toMatchObject({ id: 'run:r9', kind: 'run' })
  })

  it('无行时需关注分组出自身空态（2026-10-27 Task 4：分组空态独立，子块不再整体隐藏）；缺省 attentionRows 不炸', () => {
    const w = mount(TaskDecisionPanel, { props: BASE_PANEL_PROPS })
    // 需关注空=本分组空态（不冒充整个「待我处理」为空，也不静默消失）
    expect(w.find('[data-testid="att-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="att-empty"]').text()).toBe('ia2.att.empty')
    expect(w.find('.tdp__n--warn').exists()).toBe(false)
  })
})

describe('FlowNavPanel — v13 循环行运行脉冲', () => {
  const sessions: FlowSessionRow[] = []
  const loops: FlowLoopRow[] = [
    { kind: 'loop', id: 'lp-1', name: 'release', stageIndex: 1, stageTotal: 5, stageTone: 'run', progressPct: 30, statusKey: 'running', awaitingYou: false, blocked: false, updatedAt: NOW },
    { kind: 'loop', id: 'lp-2', name: 'watch', stageIndex: 0, stageTotal: 5, stageTone: 'todo', progressPct: 0, statusKey: 'idle', awaitingYou: false, blocked: false, updatedAt: NOW },
  ]

  it('v13 循环行运行脉冲已随「循环→工作流」换面退役（五轮 H）：pulse 不再渲染', () => {
    const w = mount(FlowNavPanel, { props: { sessions, loops, selection: null, loopActivity: { 'lp-1': { running: 2 } } as never } })
    expect(w.find('[data-testid="flow-pulse-lp-1"]').exists()).toBe(false)
  })

  it('缺省 loopActivity（向后兼容）→ 无脉冲渲染', () => {
    const w = mount(FlowNavPanel, { props: { sessions, loops, selection: null } })
    expect(w.find('[data-testid="flow-pulse-lp-1"]').exists()).toBe(false)
  })
})
