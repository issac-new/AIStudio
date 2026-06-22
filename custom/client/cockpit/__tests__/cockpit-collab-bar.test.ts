// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitCollabBar from '@/custom/cockpit/components/CockpitCollabBar.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CockpitCollabBar', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.selectTask('t1')
    s.channels = [
      { id: 'c1', taskId: 't1', kind: 'matrix', label: 'auth-svc 联调', members: ['张三', '你'] },
      { id: 'c2', taskId: 't1', kind: 'chat', label: 'review-agent', members: ['review-agent'] },
    ]
    return s
  }

  it('renders channel chips for the selected task', () => {
    seed()
    const w = mount(CockpitCollabBar)
    expect(w.text()).toContain('auth-svc 联调')
    expect(w.text()).toContain('review-agent')
  })

  it('clicking a channel selects it in store', async () => {
    const s = seed()
    const w = mount(CockpitCollabBar)
    await w.find('[data-channel-id="c2"]').trigger('click')
    expect(s.activeChannelId).toBe('c2')
  })

  it('clicking add button opens the new-collab menu', async () => {
    seed()
    const w = mount(CockpitCollabBar)
    expect(w.find('.cockpit-collab-bar__menu').exists()).toBe(false)
    await w.find('[data-action="add"]').trigger('click')
    expect(w.find('.cockpit-collab-bar__menu').exists()).toBe(true)
  })

  it('menu has three new-collab options', async () => {
    seed()
    const w = mount(CockpitCollabBar)
    await w.find('[data-action="add"]').trigger('click')
    expect(w.findAll('[data-new-kind]').length).toBe(3)
  })
})
