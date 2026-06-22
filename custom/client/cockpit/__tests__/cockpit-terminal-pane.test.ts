// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitTerminalPane from '@/custom/cockpit/components/CockpitTerminalPane.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CockpitTerminalPane', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/ws/auth-svc' }]
    s.selectTask('t1')
    return s
  }

  it('renders terminal header with workspace root path', () => {
    seed()
    const w = mount(CockpitTerminalPane)
    expect(w.text()).toContain('~/ws/auth-svc')
  })

  it('renders seed terminal lines', () => {
    seed()
    const w = mount(CockpitTerminalPane)
    expect(w.findAll('.cockpit-terminal-pane__line').length).toBeGreaterThan(0)
  })

  it('typing and pressing enter runs a command', async () => {
    const s = seed()
    const w = mount(CockpitTerminalPane)
    const before = s.terminalLines.length
    const input = w.find('.cockpit-terminal-pane__input')
    await input.setValue('ls')
    await input.trigger('keydown', { key: 'Enter' })
    expect(s.terminalLines.length).toBe(before + 2)
  })

  it('exit button calls store.exitTerminal', async () => {
    const s = seed()
    s.enterTerminal()
    const w = mount(CockpitTerminalPane)
    await w.find('[data-action="exit"]').trigger('click')
    expect(s.terminalMode).toBe(false)
  })
})
