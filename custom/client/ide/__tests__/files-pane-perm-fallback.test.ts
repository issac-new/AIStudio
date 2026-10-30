// @vitest-environment jsdom
// 权限回落守门（2026-10-31 回归修复）：非 super_admin 打开物化任务工作区时，
// /api/studio/files 的 root 闸门 403（SecFileRootSandbox patch 097，安全边界
// 不放宽）——文件页签接任务域只读通道（workspace-files）替代死胡同。
// 覆盖：权限拒+物化 → 只读树渲染；未物化/非权限拒 → 不回落。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, fallback?: string) => fallback ?? k, locale: ref('zh') }) }))

// 根校验：恒 403（root 参数需 super_admin）
vi.mock('../utils/auth-fetch', () => ({
  authFetch: vi.fn(async () => ({
    ok: false, status: 403,
    json: async () => ({ error: 'root parameter requires super administrator privileges' }),
  })),
}))

// 任务域只读通道（组件内动态 import；vi.mock 同样拦截）
const listMock = vi.fn()
vi.mock('../api/taskWorkspace', () => ({
  ideTaskFilesApi: { list: (...a: unknown[]) => listMock(...a) },
  ideTaskWorkspaceApi: { get: vi.fn() },
}))

const chatState = reactive<{ activeSession: { workspace?: string | null } | null }>({ activeSession: null })
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

const ideState = reactive<{
  workspace: string | null
  activeTaskId: string | null
  taskWorkspace: { materialized: boolean; path: string | null; board?: string } | null
  taskWorkspaceError: { status: number } | null
}>({ workspace: null, activeTaskId: null, taskWorkspace: null, taskWorkspaceError: null })
vi.mock('../store/ide', () => ({ useIdeStore: () => ideState }))

const filesState = reactive<{ workspaceRoot?: string }>({ workspaceRoot: undefined })
vi.mock('@/stores/hermes/files', () => ({ useFilesStore: () => filesState }))

import IdeFilesPane from '../views/IdeFilesPane.vue'

describe('IdeFilesPane 权限回落（非 super_admin 物化任务工作区）', () => {
  beforeEach(() => {
    chatState.activeSession = null
    ideState.workspace = null
    ideState.activeTaskId = null
    ideState.taskWorkspace = null
    ideState.taskWorkspaceError = null
    filesState.workspaceRoot = undefined
    listMock.mockReset()
  })

  it('权限拒 + 物化任务 → 任务域只读树（workspace-files 通道）+ 权限提示行', async () => {
    ideState.activeTaskId = 't_perm1'
    ideState.taskWorkspace = { materialized: true, path: '/ws/boards/swarm/workspaces/t_perm1', board: 'swarm' }
    listMock.mockResolvedValue({ path: '', entries: [
      { name: 'README.md', path: 'README.md', isDir: false, size: 12 },
      { name: 'src', path: 'src', isDir: true, children: [] },
    ] })
    const w = mount(IdeFilesPane, { global: { stubs: { FileTree: true, IdeGitPane: true } } })
    await flushPromises()
    expect(w.find('[data-testid="ide-files-invalid"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-files-perm-ro-note"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-files-perm-tree"]').exists()).toBe(true)
    expect(w.text()).toContain('README.md')
    // 任务域通道带卡 id 与回填板号
    expect(listMock).toHaveBeenCalledWith('t_perm1', 'swarm', 3)
    // 死胡同动作钮仍在（重试/选择任务工作区/查看账号角色）
    expect(w.find('[data-testid="ide-files-pick-workspace"]').exists()).toBe(true)
    w.unmount()
  })

  it('权限拒但任务未物化 → 不接只读树（保持可解释空态）', async () => {
    ideState.activeTaskId = 't_perm2'
    ideState.taskWorkspace = { materialized: false, path: '/ws/t_perm2' }
    const w = mount(IdeFilesPane, { global: { stubs: { FileTree: true, IdeGitPane: true } } })
    await flushPromises()
    expect(w.find('[data-testid="ide-files-perm-tree"]').exists()).toBe(false)
    expect(listMock).not.toHaveBeenCalled()
    w.unmount()
  })

  it('通道失败 → 空树如实呈现（不伪造条目、不炸）', async () => {
    ideState.activeTaskId = 't_perm3'
    ideState.taskWorkspace = { materialized: true, path: '/ws/t_perm3' }
    listMock.mockRejectedValue(new Error('API Error 500'))
    const w = mount(IdeFilesPane, { global: { stubs: { FileTree: true, IdeGitPane: true } } })
    await flushPromises()
    expect(w.find('[data-testid="ide-files-perm-tree"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-files-perm-tree"]').text().trim()).toBe('')
    w.unmount()
  })
})
