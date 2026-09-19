// overlay/custom/client/ide/__tests__/workspace-pane-tabs.test.ts
// 布局重构守门（用户裁定）：「文件/Git」随「查看文件」视图进侧栏（跟随任务
// workspace）；工作区列不再承载页签（仅 FilesPanel+终端）。
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

import IdeWorkspacePane from '../views/IdeWorkspacePane.vue'

describe('IdeWorkspacePane（重构后：无页签）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('工作区列不再渲染「文件/Git」页签，直接渲染 FilesPanel', async () => {
    const wrapper = mount(IdeWorkspacePane)
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.findAll('.ide-workspace-pane__tab')).toHaveLength(0)
    expect(wrapper.find('.files-panel-stub').exists()).toBe(true)
  })
})
