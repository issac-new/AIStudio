// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitTimeline from '@/custom/cockpit/components/CockpitTimeline.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, args?: Record<string, unknown>) => {
    if (args && key.includes('olderHistory')) return args.n + ' older'
    return key
  } }),
}))

describe('CockpitTimeline', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed(count = 4) {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.selectTask('t1')
    s.events = Array.from({ length: count }, (_, i) => ({
      id: 'e' + i, taskId: 't1', actor: i % 2 ? 'review-agent' : '张三',
      kind: (i % 2 ? 'A2A' : 'A2H') as 'A2A' | 'A2H',
      what: '事件 ' + i, when: '14:0' + i, pending: i === count - 1, ts: i,
    }))
    return s
  }

  it('renders visible events (no fold when <= threshold)', () => {
    seed(4)
    const w = mount(CockpitTimeline)
    expect(w.findAll('[data-event-id]').length).toBe(4)
    expect(w.find('.cockpit-timeline__fold').exists()).toBe(false)
  })

  it('folds older events when count > threshold', () => {
    seed(6)
    const w = mount(CockpitTimeline)
    expect(w.find('.cockpit-timeline__fold').exists()).toBe(true)
    expect(w.findAll('[data-event-id]').length).toBe(4)
  })

  it('expanding fold shows all events', async () => {
    seed(6)
    const w = mount(CockpitTimeline)
    await w.find('.cockpit-timeline__fold').trigger('click')
    expect(w.findAll('[data-event-id]').length).toBe(6)
  })

  it('clicking an event selects timeline node in store', async () => {
    seed(4)
    const w = mount(CockpitTimeline)
    await w.find('[data-event-id="e3"]').trigger('click')
    const s = useCockpitStore()
    expect(s.selectedTimelineNodeId).toBe('e3')
  })

  it('pending event has is-pending class', () => {
    seed(4)
    const w = mount(CockpitTimeline)
    expect(w.find('[data-event-id="e3"]').classes()).toContain('is-pending')
  })

  it('shows empty state when no task selected', () => {
    setActivePinia(createPinia())
    const w = mount(CockpitTimeline)
    expect(w.find('.cockpit-timeline__empty').exists()).toBe(true)
  })
})
