// A9 守门：useIdeJump 富绑定升级——任务有 acpSessionId 绑定时携带 session 深链，
// 无绑定/无任务/pinia 未激活均安全降级。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))

const bindings = new Map<string, { taskId: string; acpSessionId?: string }>()
vi.mock('@/custom/matrix-teams/stores/ide-linkage', () => ({
  useIdeLinkageStore: () => ({ bindingOf: (id: string | null) => (id ? bindings.get(id) ?? null : null) }),
}))

import { useIdeJump } from '../composables/useIdeJump'

describe('useIdeJump（A9 富绑定）', () => {
  beforeEach(() => { pushMock.mockClear(); bindings.clear() })

  it('任务有 acpSessionId 绑定：query 带 task+session', () => {
    bindings.set('t1', { taskId: 't1', acpSessionId: 'sess_9' })
    useIdeJump().jumpIde('t1')
    expect(pushMock).toHaveBeenCalledWith({ name: 'ide.shell', query: { task: 't1', session: 'sess_9' } })
  })

  it('任务无绑定：只带 task（旧行为不变）', () => {
    useIdeJump().jumpIde('t2')
    expect(pushMock).toHaveBeenCalledWith({ name: 'ide.shell', query: { task: 't2' } })
  })

  it('无任务：裸跳不带 query', () => {
    useIdeJump().jumpIde()
    expect(pushMock).toHaveBeenCalledWith({ name: 'ide.shell', query: undefined })
  })
})
