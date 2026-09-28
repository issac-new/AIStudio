// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/cockpit-overview.test.ts
// P5 驾驶舱概览守门（2026-09-28 §六）：三卡聚合（我的待办/评审闸口/交付进度）——
// 计数真实计算、完成率条、跳转 emit、空态。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }) }))

import CockpitOverview from '../components/flow/CockpitOverview.vue'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

function task(id: string, status: string, raci?: unknown): CockpitTask {
  return { id, title: `任务 ${id}`, status, raci } as unknown as CockpitTask
}

const TASKS: CockpitTask[] = [
  task('t_1', 'done'),
  task('t_2', 'done'),
  task('t_3', 'running', { responsible: ['@fanfan:matrix.test'], approver: ['admin'], consulted: [], informed: [] }),
  task('t_4', 'review'),
  task('t_5', 'blocked'),
]

const PENDING = [
  { id: 'fleet:s1:a1', kind: 'command' as const, title: '会话 A', detail: 'git push', createdAt: 1000 },
  { id: 'review:rev-1', kind: 'review' as const, title: '评审 · t_4', detail: '未提交变更', taskId: 't_4', createdAt: 2000 },
]

const HISTORY = [
  { id: 'review:rev-0', ts: 500, actor: 'wei', targetKind: 'review' as const, targetId: 'rev-0', targetTitle: '评审 · t_0', decision: 'approve' },
  { id: 'kanban:t_9', ts: 400, actor: 'admin', targetKind: 'kanban' as const, targetId: 't_9', targetTitle: '旧卡', decision: 'approve' },
]

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('P5 驾驶舱概览', () => {
  it('三卡渲染 + 我的待办=审批待审+RACI 等我卡', () => {
    const w = mount(CockpitOverview, {
      props: { tasks: TASKS, pending: PENDING, history: HISTORY, username: 'fanfan' },
    })
    expect(w.find('[data-testid="ov-todo"]').exists()).toBe(true)
    expect(w.find('[data-testid="ov-gates"]').exists()).toBe(true)
    expect(w.find('[data-testid="ov-progress"]').exists()).toBe(true)
    // 待审 2 + 我是 R 的卡 1（t_3）= 3
    expect(w.find('[data-testid="ov-todo"]').text()).toContain('3')
    // 我的 RACI 卡列出并可点
    expect(w.find('[data-testid="ov-mytask-t_3"]').exists()).toBe(true)
  })

  it('交付进度：完成率 2/5=40% 渲染进度条', () => {
    const w = mount(CockpitOverview, {
      props: { tasks: TASKS, pending: [], history: [], username: 'fanfan' },
    })
    const fill = w.find('[data-testid="ov-progress-fill"]')
    expect(fill.attributes('style')).toContain('width: 40%')
  })

  it('评审闸口：待裁决 1 + 最近裁决只取 review 类（kanban 决策不混入）', () => {
    const w = mount(CockpitOverview, {
      props: { tasks: [], pending: PENDING, history: HISTORY, username: 'fanfan' },
    })
    expect(w.find('[data-testid="ov-gates-pending"]').text()).toContain('1')
    expect(w.find('[data-testid="ov-verdict-rev-0"]').exists()).toBe(true)
    expect(w.find('[data-testid="ov-verdict-t_9"]').exists()).toBe(false)
  })

  it('跳转 emit：待审行→open-inbox，RACI 行→open-board，任务行→open-task', async () => {
    const w = mount(CockpitOverview, {
      props: { tasks: TASKS, pending: PENDING, history: [], username: 'fanfan' },
    })
    await w.find('[data-testid="ov-todo-approvals"]').trigger('click')
    await w.find('[data-testid="ov-todo-raci"]').trigger('click')
    await w.find('[data-testid="ov-mytask-t_3"]').trigger('click')
    expect(w.emitted('open-inbox')).toBeTruthy()
    expect(w.emitted('open-board')).toBeTruthy()
    expect(w.emitted('open-task')?.[0]).toEqual(['t_3'])
  })

  it('空态：零任务零待审零历史不炸，进度 0%', () => {
    const w = mount(CockpitOverview, {
      props: { tasks: [], pending: [], history: [], username: '' },
    })
    expect(w.find('[data-testid="ov-progress-fill"]').attributes('style')).toContain('width: 0%')
    expect(w.text()).toContain('ia2.overviewDash.noVerdicts')
  })
})
