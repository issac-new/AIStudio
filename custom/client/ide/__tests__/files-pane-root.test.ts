// @vitest-environment jsdom
// IDE 文件页签根目录接线守门（2026-10-18 回归）：FileTree 的 workspaceKey 只是
// 标签，真正列目录的是 filesStore.workspaceRoot；未接线时页面显示工作区名、
// 实际列 ~/.hermes（实测）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, fallback?: string) => fallback ?? k }) }))
vi.mock('../utils/auth-fetch', () => ({
  authFetch: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ entries: [] }) })),
}))

const chatState = reactive<{ activeSession: { workspace?: string | null } | null }>({ activeSession: null })
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

const ideState = reactive<{ workspace: string | null }>({ workspace: '/ws/a' })
vi.mock('../store/ide', () => ({ useIdeStore: () => ideState }))

const filesState = reactive<{ workspaceRoot?: string }>({ workspaceRoot: undefined })
vi.mock('@/stores/hermes/files', () => ({ useFilesStore: () => filesState }))

import IdeFilesPane from '../views/IdeFilesPane.vue'

describe('IdeFilesPane → filesStore.workspaceRoot', () => {
  beforeEach(() => {
    chatState.activeSession = null
    ideState.workspace = '/ws/a'
    filesState.workspaceRoot = undefined
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
