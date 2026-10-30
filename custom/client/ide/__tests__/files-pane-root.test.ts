// @vitest-environment jsdom
// IDE 文件页签根目录接线守门（2026-10-18 回归）：FileTree 的 workspaceKey 只是
// 标签，真正列目录的是 filesStore.workspaceRoot；未接线时页面显示工作区名、
// 实际列 ~/.hermes（实测）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, fallback?: string) => fallback ?? k, locale: ref('zh') }) }))
vi.mock('../utils/auth-fetch', () => ({
  authFetch: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ entries: [] }) })),
}))

const chatState = reactive<{ activeSession: { workspace?: string | null } | null }>({ activeSession: null })
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

const ideState = reactive<{
  workspace: string | null
  activeTaskId: string | null
  taskWorkspace: { materialized: boolean; path: string | null } | null
  taskWorkspaceError: { status: number } | null
}>({ workspace: '/ws/a', activeTaskId: null, taskWorkspace: null, taskWorkspaceError: null })
vi.mock('../store/ide', () => ({ useIdeStore: () => ideState }))

const filesState = reactive<{ workspaceRoot?: string }>({ workspaceRoot: undefined })
vi.mock('@/stores/hermes/files', () => ({ useFilesStore: () => filesState }))

import IdeFilesPane from '../views/IdeFilesPane.vue'

describe('IdeFilesPane → filesStore.workspaceRoot', () => {
  beforeEach(() => {
    chatState.activeSession = null
    ideState.workspace = '/ws/a'
    ideState.activeTaskId = null
    ideState.taskWorkspace = null
    ideState.taskWorkspaceError = null
    filesState.workspaceRoot = undefined
  })

  it('未物化任务工作区：右栏出默认根只读树（不再停在死胡同空态）', async () => {
    ideState.workspace = null
    ideState.activeTaskId = 't_af224933'
    ideState.taskWorkspace = { materialized: false, path: '/ws/t_af224933' }
    const w = mount(IdeFilesPane, { global: { stubs: { FileTree: true, IdeGitPane: true } } })
    await flushPromises()
    expect(w.find('[data-testid="ide-files-readonly-fallback"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-files-readonly-note"]').text()).toContain('未物化任务工作区')
    expect(w.find('[data-testid="ide-files-no-workspace"]').exists()).toBe(false)
    w.unmount()
  })

  it('任务不存在/解析故障：右栏不渲染只读树（保持可解释空态）', async () => {
    ideState.workspace = null
    ideState.activeTaskId = 'DEV-NOPE-9'
    ideState.taskWorkspaceError = { status: 404 }
    const w = mount(IdeFilesPane, { global: { stubs: { FileTree: true, IdeGitPane: true } } })
    await flushPromises()
    expect(w.find('[data-testid="ide-files-readonly-fallback"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-files-no-workspace"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-files-no-workspace-message"]').text()).toContain('不存在或当前账号无权访问')
    w.unmount()
  })

  it('挂载即把 IDE 工作区写入 filesStore.workspaceRoot（FileTree 据此列目录）', async () => {
    const w = mount(IdeFilesPane, { global: { stubs: { FileTree: true, IdeGitPane: true } } })
    await flushPromises()
    expect(filesState.workspaceRoot).toBe('/ws/a')
    w.unmount()
  })

  it('会话 workspace 优先于 IDE 工作区；切换时同步更新', async () => {
    chatState.activeSession = { workspace: '/ws/session' }
    const w = mount(IdeFilesPane, { global: { stubs: { FileTree: true, IdeGitPane: true } } })
    await flushPromises()
    expect(filesState.workspaceRoot).toBe('/ws/session')
    chatState.activeSession = null
    await flushPromises()
    expect(filesState.workspaceRoot).toBe('/ws/a')
    w.unmount()
  })

  it('卸载时清空 workspaceRoot，避免污染其它页面', async () => {
    const w = mount(IdeFilesPane, { global: { stubs: { FileTree: true, IdeGitPane: true } } })
    await flushPromises()
    w.unmount()
    expect(filesState.workspaceRoot).toBeUndefined()
  })

  it('patch 655 注册且 FileTree 支持 showFiles（IDE 树内直出文件）', () => {
    const patch = resolve(__dirname, '../../../../patches/655-client-filetree-show-files.patch')
    expect(existsSync(patch)).toBe(true)
    expect(readFileSync(resolve(__dirname, '../../../../patches/series'), 'utf8'))
      .toContain('655-client-filetree-show-files.patch')
    expect(readFileSync(patch, 'utf8')).toContain('props.showFiles')
  })
})
