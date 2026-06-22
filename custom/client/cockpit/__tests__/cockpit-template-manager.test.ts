// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitTemplateManager from '@/custom/cockpit/components/CockpitTemplateManager.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, args?: Record<string, unknown>) => {
    if (args && key.includes('templateCount')) return String(args.n)
    return key
  } }),
}))

describe('CockpitTemplateManager', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.templates = [
      { id: 'tpl1', name: 'PR 审核', decision: 'conditional', riskTags: ['concurrency'], opinion: 'ok', modifiedFiles: [] },
      { id: 'tpl2', name: '快速通过', decision: 'approve', riskTags: [], opinion: '', modifiedFiles: [] },
    ]
    return s
  }

  it('renders the template list', () => {
    seed()
    const w = mount(CockpitTemplateManager)
    expect(w.text()).toContain('PR 审核')
    expect(w.text()).toContain('快速通过')
  })

  it('shows empty state when no templates', () => {
    setActivePinia(createPinia())
    const w = mount(CockpitTemplateManager)
    expect(w.find('.cockpit-template-manager__empty').exists()).toBe(true)
  })

  it('delete button removes the template', async () => {
    const s = seed()
    const w = mount(CockpitTemplateManager)
    await w.find('[data-template-id="tpl1"] [data-action="delete"]').trigger('click')
    expect(s.templates.find((t) => t.id === 'tpl1')).toBeUndefined()
  })

  it('apply button applies template to current work item and closes', async () => {
    const s = seed()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.selectTask('t1')
    s.workItems = [{ id: 'w1', taskId: 't1', decision: 'reject', riskTags: [], opinion: '', modifiedFiles: [] }]
    s.openTemplateManager()
    const w = mount(CockpitTemplateManager)
    await w.find('[data-template-id="tpl1"] [data-action="apply"]').trigger('click')
    expect(s.workItemForSelectedTask?.decision).toBe('conditional')
    expect(s.templateManagerOpen).toBe(false)
  })

  it('close button closes the manager', async () => {
    const s = seed()
    s.openTemplateManager()
    const w = mount(CockpitTemplateManager)
    await w.find('[data-action="close"]').trigger('click')
    expect(s.templateManagerOpen).toBe(false)
  })
})
