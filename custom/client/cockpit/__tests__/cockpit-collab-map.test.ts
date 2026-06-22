// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitCollabMap from '@/custom/cockpit/components/CockpitCollabMap.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('CockpitCollabMap', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/ws' }]
    s.selectTask('t1')
    s.appTopology = [
      { id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'file', focus: true, links: ['n2'] },
      { id: 'n2', taskId: 't1', label: 'auth.spec', kind: 'test', focus: false, links: [] },
    ]
    s.reqTopology = [{ id: 'r1', taskId: 't1', label: '认证重构', kind: 'req', focus: true }]
    s.projTopology = [{ id: 'p1', taskId: 't1', label: 'auth-platform', kind: 'project', focus: true }]
    return s
  }

  it('renders nodes for current level (app default)', () => {
    seed()
    const w = mount(CockpitCollabMap)
    expect(w.text()).toContain('refresh.ts')
    expect(w.text()).toContain('auth.spec')
  })

  it('switching to req level shows req nodes', async () => {
    seed()
    const w = mount(CockpitCollabMap)
    await w.find('[data-level="req"]').trigger('click')
    expect(w.text()).toContain('认证重构')
  })

  it('renders SVG line between linked nodes', () => {
    seed()
    const w = mount(CockpitCollabMap)
    expect(w.findAll('line').length).toBeGreaterThan(0)
  })

  it('renders empty state when no task selected', () => {
    setActivePinia(createPinia())
    const w = mount(CockpitCollabMap)
    expect(w.find('.cockpit-map__empty').exists()).toBe(true)
  })
})
