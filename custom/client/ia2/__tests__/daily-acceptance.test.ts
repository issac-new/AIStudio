// @vitest-environment jsdom
// ⑤验收日常面板守门：数据源=跨板看板任务；UAT/G5 不写推演台账。
import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))

const rawTasks = vi.hoisted(() => [])
vi.mock('../store/workspace', () => ({
  useWorkspaceStore: () => ({
    rawTasks: rawTasks,
    tasks: rawTasks.map(r => r.task),
    refreshAllBoards: vi.fn(async () => true),
  }),
}))
vi.mock('@/custom/cockpit/components/ApprovalPanel.vue', () => ({
  default: { name: 'ApprovalPanel', template: '<div data-testid="approval-panel-stub" />' },
}))

import DailyTracePanel from '../views/stage/DailyTracePanel.vue'
import DailyUatPanel from '../views/stage/DailyUatPanel.vue'

const task = (id: string, status: string, extra = {}) => ({
  board: 'main', task: { id, title: `任务 ${id}`, status, assignee: 'chen', created_at: 1, started_at: null, completed_at: null, workspace_path: '/work/repo/packages/client', branch_name: 'feature/x', result: status === 'done' ? '测试通过' : null, ...extra },
})

describe('daily acceptance panels', () => {
  it('需求追溯读看板任务，不出现推演运行空态', async () => {
    rawTasks.splice(0, rawTasks.length, task('t1', 'review'), task('t2', 'done'))
    const w = mount(DailyTracePanel)
    await flushPromises()
    expect(w.find('[data-testid="daily-trace-t1"]').exists()).toBe(true)
    expect(w.text()).toContain('按看板任务追踪')
    expect(w.text()).not.toContain('选择一次运行')
    w.unmount()
  })

  it('UAT 待判只列 review 任务，动作回任务卡', async () => {
    rawTasks.splice(0, rawTasks.length, task('t1', 'review'), task('t2', 'done'))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/inbox', name: 'ia2.inbox', component: { template: '<div />' } }] })
    await router.push('/app/inbox')
    await router.isReady()
    const w = mount(DailyUatPanel, { global: { plugins: [router] } })
    await flushPromises()
    expect(w.find('[data-testid="daily-uat-t1"]').exists()).toBe(true)
    expect(w.find('[data-testid="daily-uat-t2"]').exists()).toBe(false)
    w.find('[data-testid="daily-uat-t1"] button').trigger('click')
    expect(w.emitted('open-task')?.[0]).toEqual(['t1'])
    w.unmount()
  })
})
