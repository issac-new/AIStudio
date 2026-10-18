// @vitest-environment jsdom
// 自检弹层接线守门：命令入口打开后自动跑，渲染结果行，可关闭。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const chatState = {
  sessions: [{ id: 's1' }],
  activeSessionId: 's1',
  sessionsLoaded: true,
}
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

vi.mock('../utils/auth-fetch', () => ({
  authFetch: vi.fn(async (path: string) => {
    const body = path.startsWith('/api/studio/files/list') ? { entries: [{}] }
      : path.startsWith('/api/ide/git/status') ? { repoRoot: '/ws', branch: 'main', changes: [] }
        : path.startsWith('/api/ide/storage/snapshot') ? { categories: [{}] }
          : path.startsWith('/api/ide/slash-commands') ? { commands: [{}] }
            : path.startsWith('/api/ide/automations') ? { rules: [] }
              : path.startsWith('/api/ide/engine-models') ? { config: { providers: [{}] } }
                : path.startsWith('/api/zcode-engine/workflow/saved') ? { workflows: [] }
                  : path.startsWith('/api/context-archive/sessions') ? { sessions: [] }
                    : path.startsWith('/api/ide/worktree/list') ? { worktrees: [] }
                      : {}
    return { ok: true, status: 200, json: async () => body } as Response
  }),
}))

import IdeSelfCheckDialog from '../components/IdeSelfCheckDialog.vue'
import { useIdeStore } from '../store/ide'

describe('IdeSelfCheckDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('打开即自动自检并渲染全部探针行；关闭写回 store', async () => {
    const ide = useIdeStore()
    ide.setWorkspace('/ws')
    const w = mount(IdeSelfCheckDialog, { global: { stubs: { Teleport: true } } })
    expect(w.find('[data-testid="ide-selfcheck"]').exists()).toBe(false)

    ide.openSelfCheck()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))
    await flushPromises()

    expect(w.find('[data-testid="ide-selfcheck"]').exists()).toBe(true)
    const rows = w.findAll('[data-testid^="ide-selfcheck-"]')
    expect(rows.length).toBeGreaterThanOrEqual(10)
    expect(w.find('[data-testid="ide-selfcheck-summary"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-selfcheck-files"]').text()).toContain('通过')

    await w.find('[data-testid="ide-selfcheck-close"]').trigger('click')
    expect(ide.selfCheckOpen).toBe(false)
    w.unmount()
  })
})
