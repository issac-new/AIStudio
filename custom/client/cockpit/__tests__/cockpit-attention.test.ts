// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitAttention from '@/custom/cockpit/components/CockpitAttention.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CockpitAttention', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders count badge from store', () => {
    const s = useCockpitStore()
    s.attention = [
      { id: 'a1', severity: 'high', title: 'PR 风险', taskId: 't1' },
      { id: 'a2', severity: 'medium', title: '集群提问', taskId: 't2' },
    ]
    const w = mount(CockpitAttention)
    expect(w.text()).toContain('2')
    expect(w.text()).toContain('需要你')
  })

  it('clicking an item selects its task in the store', async () => {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.attention = [{ id: 'a1', severity: 'high', title: 'PR 风险', taskId: 't1' }]
    const w = mount(CockpitAttention)
    await w.find('.cockpit-attention__item').trigger('click')
    expect(s.selectedTaskId).toBe('t1')
  })

  it('applies severity class to the item', () => {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.attention = [{ id: 'a1', severity: 'high', title: 'x', taskId: 't1' }]
    const w = mount(CockpitAttention)
    expect(w.find('.cockpit-attention__item').classes()).toContain('is-high')
  })
})
