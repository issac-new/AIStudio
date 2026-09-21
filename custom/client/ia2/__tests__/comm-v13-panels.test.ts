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
import type { AttentionRow } from '../adapters/activity'
import type { FlowLoopRow, FlowSessionRow } from '../adapters/flow'

const NOW = Date.now()

function attRow(over: Partial<AttentionRow> & { id: string }): AttentionRow {
  return { kind: 'task-blocked', title: `t-${over.id}`, subKey: 'ia2.att.subTaskBlocked', ts: NOW - 600_000, ...over }
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

describe('TaskDecisionPanel — v13 需关注节', () => {
  it('有行时节头计数徽章 + 行渲染（副文 i18n + 等待时长）；行点击上抛 open-attention', async () => {
    const w = mount(TaskDecisionPanel, {
      props: {
        ...BASE_PANEL_PROPS,
        attentionRows: [
          attRow({ id: 'task:t1', kind: 'task-blocked', taskId: 't1' }),
          attRow({ id: 'run:r9', kind: 'run-failed', runId: 'r9', subKey: 'ia2.att.subRunFailed' }),
        ],
      },
    })
    expect(w.find('[data-testid="attention-list"]').exists()).toBe(true)
    expect(w.find('.tdp__n--warn').text()).toBe('2')
    expect(w.find('[data-testid="att-task:t1"]').text()).toContain('ia2.att.subTaskBlocked')
    expect(w.find('[data-testid="att-task:t1"]').text()).toContain('10m')
    await w.find('[data-testid="att-run:r9"]').trigger('click')
    const emitted = w.emitted('open-attention')
    expect(emitted).toHaveLength(1)
    expect(emitted![0][0]).toMatchObject({ runId: 'r9', kind: 'run-failed' })
  })

  it('无行时空态文案（向后兼容：缺省 attentionRows 不炸）', () => {
    const w = mount(TaskDecisionPanel, { props: BASE_PANEL_PROPS })
    expect(w.find('[data-testid="att-empty"]').exists()).toBe(true)
    expect(w.find('.tdp__n--warn').exists()).toBe(false)
  })
})

describe('FlowNavPanel — v13 循环行运行脉冲', () => {
  const sessions: FlowSessionRow[] = []
  const loops: FlowLoopRow[] = [
    { kind: 'loop', id: 'lp-1', name: 'release', stageIndex: 1, stageTotal: 5, stageTone: 'run', progressPct: 30, statusKey: 'running', awaitingYou: false, blocked: false, updatedAt: NOW },
    { kind: 'loop', id: 'lp-2', name: 'watch', stageIndex: 0, stageTotal: 5, stageTone: 'todo', progressPct: 0, statusKey: 'idle', awaitingYou: false, blocked: false, updatedAt: NOW },
  ]

  it('loopActivity.running>0 → ●N 脉冲（title 提示运行数）；无活动行不渲染', () => {
    const w = mount(FlowNavPanel, {
      props: {
        sessions, loops, selection: null,
        loopActivity: { 'lp-1': { running: 2, awaiting: 0, failed: 0 } },
      },
    })
    const pulse = w.find('[data-testid="flow-pulse-lp-1"]')
    expect(pulse.exists()).toBe(true)
    expect(pulse.text()).toBe('●2')
    expect(pulse.attributes('title')).toBe('ia2.act.running:{"n":2}')
    expect(w.find('[data-testid="flow-pulse-lp-2"]').exists()).toBe(false)
  })

  it('缺省 loopActivity（向后兼容）→ 无脉冲渲染', () => {
    const w = mount(FlowNavPanel, { props: { sessions, loops, selection: null } })
    expect(w.find('[data-testid="flow-pulse-lp-1"]').exists()).toBe(false)
  })
})
