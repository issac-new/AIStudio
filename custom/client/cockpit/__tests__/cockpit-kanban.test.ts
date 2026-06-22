// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitKanban from '@/custom/cockpit/components/CockpitKanban.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

describe('CockpitKanban', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [
      { id: '1', title: 'PR #142', category: 'human', priority: 'P0', status: 'review', assignee: '@张三', workspace: '~/ws/a' },
      { id: '2', title: '联调', category: 'human', priority: 'P1', status: 'blocked', assignee: '@李四', workspace: '~/ws/b' },
      { id: '3', title: '发版', category: 'cluster', priority: 'P1', status: 'running', assignee: 'arch', workspace: '~/ws/c' },
    ]
    return s
  }

  it('groups tasks by category under category headers', () => {
    seed()
    const w = mount(CockpitKanban)
    const cats = w.findAll('.cockpit-kanban__cat')
    expect(cats.length).toBe(3)
  })

  it('renders P0 task with is-p0 class', () => {
    seed()
    const w = mount(CockpitKanban)
    const t = w.find('[data-task-id="1"]')
    expect(t.classes()).toContain('is-p0')
  })

  it('clicking a task selects it in the store', async () => {
    seed()
    const w = mount(CockpitKanban)
    await w.find('[data-task-id="2"]').trigger('click')
    const s = useCockpitStore()
    expect(s.selectedTaskId).toBe('2')
  })

  it('clicking a priority filter chip toggles the filter', async () => {
    const s = seed()
    const w = mount(CockpitKanban)
    await w.find('[data-filter="P0"]').trigger('click')
    expect(s.filters.priorities).toContain('P0')
    await w.find('[data-filter="P0"]').trigger('click')
    expect(s.filters.priorities).not.toContain('P0')
  })

  it('filtering by P1 hides the P0 task', async () => {
    const s = seed()
    const w = mount(CockpitKanban)
    await w.find('[data-filter="P1"]').trigger('click')
    expect(w.find('[data-task-id="1"]').exists()).toBe(false)
    expect(w.find('[data-task-id="2"]').exists()).toBe(true)
  })

  it('emits collapse when collapse button clicked', async () => {
    seed()
    const w = mount(CockpitKanban)
    await w.find('.cockpit-collapse-btn').trigger('click')
    expect(w.emitted('collapse')).toBeTruthy()
  })
})
