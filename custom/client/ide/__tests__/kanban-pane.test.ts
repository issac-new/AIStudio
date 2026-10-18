// IDE 看板四视图守门（UI-10：默认 board 视图/列桶分组/视图切换/泳道/表）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const tasksSeed = [
  { id: 't1', title: '修复登录', assignee: 'alice', status: 'todo', priority: 0, started_at: 1000, completed_at: null, body: null, created_by: null, created_at: 0, workspace_kind: 'git', workspace_path: null, tenant: null, project_id: null, result: null, skills: null },
  { id: 't2', title: '编写文档', assignee: 'bob', status: 'doing', priority: 2, started_at: 2000, completed_at: null, body: null, created_by: null, created_at: 0, workspace_kind: 'git', workspace_path: null, tenant: null, project_id: null, result: null, skills: null },
]
vi.mock('@/api/hermes/kanban', () => ({
  listBoards: vi.fn(async () => [{ slug: 'main', archived: false }]),
  listTasks: vi.fn(async () => ({ tasks: tasksSeed })),
}))

import IdeKanbanPane from '../views/IdeKanbanPane.vue'

describe('IdeKanbanPane（四视图）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('默认 board 视图：列桶按 status 分组+优先级色标', async () => {
    const w = mount(IdeKanbanPane)
    await flushPromises()
    expect(w.find('[data-testid="ide-kanban-view-board"]').classes()).toContain('is-active')
    expect(w.find('[data-testid="ide-kanban-board"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-kanban-task-t1"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-kanban-task-t1"]').classes()).toContain('is-p0')
    expect(w.text()).toContain('todo · 1')
  })

  it('切换 list/swimlane/gantt 视图各自渲染', async () => {
    const w = mount(IdeKanbanPane)
    await flushPromises()
    await w.find('[data-testid="ide-kanban-view-list"]').trigger('click')
    expect(w.find('[data-testid="ide-kanban-list"]').exists()).toBe(true)
    await w.find('[data-testid="ide-kanban-view-swimlane"]').trigger('click')
    expect(w.find('[data-testid="ide-kanban-swimlane"]').exists()).toBe(true)
    expect(w.text()).toContain('alice · 1')
    await w.find('[data-testid="ide-kanban-view-gantt"]').trigger('click')
    expect(w.find('[data-testid="ide-kanban-gantt"]').exists()).toBe(true)
    expect(w.find('.ide-kanban__gbar').exists()).toBe(true)
  })
})

// ── 关联轮（2026-10-18）：卡片点击 → /ide?task=<id> 深链（发现路径）──
import { createRouter, createMemoryHistory } from 'vue-router'

describe('IdeKanbanPane 卡片点击深链', () => {
  it('board 卡与 list 行点击都发 /ide?task=<id>（一条链带起任务绑定+workspace 关联）', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/ide', component: { template: '<div/>' } }] })
    const pushes: Array<{ path: string; query: Record<string, string> }> = []
    router.push = async (to: unknown) => {
      const loc = to as { path: string; query: Record<string, string> }
      pushes.push({ path: loc.path, query: loc.query })
      return Promise.resolve()
    }
    const w = mount(IdeKanbanPane, { global: { plugins: [router] } })
    await flushPromises()
    await w.find('[data-testid="ide-kanban-task-t1"]').trigger('click')
    await w.find('[data-testid="ide-kanban-view-list"]').trigger('click')
    await w.find('[data-testid="ide-kanban-task-t2"]').trigger('click')
    expect(pushes).toEqual([
      { path: '/ide', query: { task: 't1' } },
      { path: '/ide', query: { task: 't2' } },
    ])
  })
})
