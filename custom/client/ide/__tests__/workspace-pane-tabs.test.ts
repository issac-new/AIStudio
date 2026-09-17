// overlay/custom/client/ide/__tests__/workspace-pane-tabs.test.ts
// 工作区列双页签守门：文件/Git 切换渲染，Git 页签承载 IdeGitPane。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/stores/hermes/files', () => ({
  useFilesStore: () => ({
    workspaceRoot: undefined,
    currentPath: '',
    fetchEntries: vi.fn(async () => []),
    previewFile: null,
  }),
}))
vi.mock('@/components/hermes/chat/FilesPanel.vue', () => ({
  default: { name: 'FilesPanel', template: '<div class="files-panel-stub" />' },
}))
vi.mock('../views/IdeGitPane.vue', () => ({
  default: { name: 'IdeGitPane', template: '<div class="ide-git-stub" />' },
}))

import IdeWorkspacePane from '../views/IdeWorkspacePane.vue'

describe('IdeWorkspacePane 双页签', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('默认文件页签激活：渲染 FilesPanel，不渲染 Git 面', async () => {
    const wrapper = mount(IdeWorkspacePane)
    // fetchEntries 已 resolve（同步 flush 由 await 触发）
    await new Promise((r) => setTimeout(r, 0))
    const tabs = wrapper.findAll('.ide-workspace-pane__tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].text()).toBe('ide.workspaceTab_files')
    expect(tabs[1].text()).toBe('ide.workspaceTab_git')
    expect(tabs[0].classes()).toContain('is-active')
    expect(wrapper.find('.files-panel-stub').exists()).toBe(true)
    expect(wrapper.find('.ide-git-stub').exists()).toBe(false)
  })

  it('点击 Git 页签切换渲染 IdeGitPane', async () => {
    const wrapper = mount(IdeWorkspacePane)
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.findAll('.ide-workspace-pane__tab')[1].trigger('click')
    expect(wrapper.find('.ide-git-stub').exists()).toBe(true)
    expect(wrapper.find('.files-panel-stub').exists()).toBe(false)
  })
})
