// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/dispatch-target-no-registry.test.ts
// 守门：未配置注册房间时 sendAssignment 不发送、返回 false（简报 doMock 分支的独立文件级实现）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const sentEvents: Array<{ roomId: string; type: string; content: unknown }> = []
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: { sendEvent: async (...args: unknown[]) => { sentEvents.push(args as never) } } }, userId: { value: '@alice:sv' } }),
}))
vi.mock('../stores/team-registry', () => ({
  useTeamRegistryStore: () => ({ registryRoomId: { value: null }, accounts: { value: [] }, isLeader: { value: true } }),
}))

import { useTaskDispatchStore } from '../stores/task-dispatch'

beforeEach(() => { setActivePinia(createPinia()); sentEvents.length = 0 })

describe('未配置注册房间', () => {
  it('sendAssignment 返回 false 且不发送事件', async () => {
    const store = useTaskDispatchStore()
    expect(await store.sendAssignment({ title: 'x', target: { account: '@b:sv' } })).toBe(false)
    expect(sentEvents).toHaveLength(0)
  })
})
