// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitHistoryModal from '@/custom/cockpit/components/CockpitHistoryModal.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CockpitHistoryModal', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/w' }]
    s.history = [
      { id: 'h1', when: '今天 14:36', taskId: 't1', action: '审批', title: '审批 PR #142', archived: false },
      { id: 'h2', when: '昨天 18:40', taskId: 't1', action: '审批', title: '审批 v2.2', archived: true },
    ]
    return s
  }

  it('renders filtered history items', () => {
    seed()
    const w = mount(CockpitHistoryModal)
    expect(w.text()).toContain('审批 PR #142')
    expect(w.findAll('[data-history-id]').length).toBe(2)
  })

  it('clicking an active item recalls it (closes modal, selects task, not archived)', async () => {
    const s = seed()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-history-id="h1"]').trigger('click')
    expect(s.historyOpen).toBe(false)
    expect(s.selectedTaskId).toBe('t1')
    expect(s.archivedMode).toBe(false)
  })

  it('clicking an archived item sets archived mode', async () => {
    const s = seed()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-history-id="h2"]').trigger('click')
    expect(s.archivedMode).toBe(true)
  })

  it('action filter chip toggles', async () => {
    const s = seed()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-action-filter="审批"]').trigger('click')
    expect(s.historyFilters.actions).toContain('审批')
  })

  it('close button closes the modal', async () => {
    const s = seed()
    s.openHistory()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-action="close"]').trigger('click')
    expect(s.historyOpen).toBe(false)
  })
})
