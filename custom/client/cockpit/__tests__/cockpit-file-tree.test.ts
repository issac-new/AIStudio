// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitFileTree from '@/custom/cockpit/components/CockpitFileTree.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('CockpitFileTree', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const s = useCockpitStore()
    s.tasks = [{ id: 't1', title: 'PR', category: 'human', priority: 'P0', status: 'review', assignee: '@z', workspace: '~/ws/auth-svc' }]
    s.selectTask('t1')
    s.fileTrees = {
      t1: [
        { id: 'f1', name: 'src', isDir: true, children: [{ id: 'f2', name: 'refresh.ts', isDir: false, modified: true }] },
        { id: 'f3', name: 'package.json', isDir: false, modified: false },
      ],
    }
    return s
  }

  it('renders top-level files and directories', () => {
    seed()
    const w = mount(CockpitFileTree)
    expect(w.text()).toContain('src')
    expect(w.text()).toContain('package.json')
  })

  it('directory is collapsed by default (children hidden)', () => {
    seed()
    const w = mount(CockpitFileTree)
    expect(w.find('[data-file-id="f2"]').exists()).toBe(false)
  })

  it('clicking a directory expands it', async () => {
    seed()
    const w = mount(CockpitFileTree)
    await w.find('[data-file-id="f1"]').trigger('click')
    expect(w.find('[data-file-id="f2"]').exists()).toBe(true)
  })

  it('clicking a file selects it in the store', async () => {
    seed()
    const w = mount(CockpitFileTree)
    await w.find('[data-file-id="f1"]').trigger('click')
    await w.find('[data-file-id="f2"]').trigger('click')
    const s = useCockpitStore()
    expect(s.selectedFileId).toBe('f2')
  })

  it('modified file has is-modified class', async () => {
    seed()
    const w = mount(CockpitFileTree)
    await w.find('[data-file-id="f1"]').trigger('click')
    expect(w.find('[data-file-id="f2"]').classes()).toContain('is-modified')
  })

  it('shows current workspace path from selected task', () => {
    seed()
    const w = mount(CockpitFileTree)
    expect(w.text()).toContain('~/ws/auth-svc')
  })
})
