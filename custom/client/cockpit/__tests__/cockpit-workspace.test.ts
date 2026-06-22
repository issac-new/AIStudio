// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitWorkspace from '@/custom/cockpit/components/CockpitWorkspace.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, args?: Record<string, unknown>) => {
      if (args && key.includes('basedOnTemplate')) return args.tpl + '/' + args.n
      return key
    },
  }),
}))

describe('CockpitWorkspace', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR #142', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/ws' }]
    s.selectTask('t1')
    s.workItems = [{
      id: 'w1', taskId: 't1', decision: 'conditional',
      riskTags: ['concurrency', 'test-gap'], opinion: '补用例再合并', modifiedFiles: ['refresh.ts'],
    }]
    return s
  }

  it('renders the work item opinion and decision', () => {
    seed()
    const w = mount(CockpitWorkspace)
    expect(w.text()).toContain('补用例再合并')
  })

  it('renders decision options with the current one selected', () => {
    seed()
    const w = mount(CockpitWorkspace)
    const cond = w.find('[data-decision="conditional"]')
    expect(cond.classes()).toContain('is-selected')
  })

  it('clicking a decision option updates the store', async () => {
    const s = seed()
    const w = mount(CockpitWorkspace)
    await w.find('[data-decision="approve"]').trigger('click')
    expect(s.workItemForSelectedTask?.decision).toBe('approve')
  })

  it('clicking a risk tag chip toggles it', async () => {
    const s = seed()
    const w = mount(CockpitWorkspace)
    await w.find('[data-tag="performance"]').trigger('click')
    expect(s.workItemForSelectedTask?.riskTags).toContain('performance')
  })

  it('shows empty state when no work item', () => {
    setActivePinia(createPinia())
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'x', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/ws' }]
    s.selectTask('t1')
    const w = mount(CockpitWorkspace)
    expect(w.find('.cockpit-workspace__empty').exists()).toBe(true)
  })

  it('submit button emits submit event', async () => {
    seed()
    const w = mount(CockpitWorkspace)
    await w.find('[data-action="submit"]').trigger('click')
    expect(w.emitted('submit')).toBeTruthy()
  })
})
