// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sit-counts-online.test.ts
// cockpit-online-zero 守门（aipaydev 推演实锤）：team-registry 空（未登录 Matrix /
// 团队未注册）时，people/agents 不得恒 0——以 fleetSessions 聚合兜底；
// registry 有数据时维持原口径。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { fleetSessionsRef, accountsRef } = vi.hoisted(() => ({
  fleetSessionsRef: { value: [] as Array<{ profile: string }> },
  accountsRef: { value: [] as Array<{ agentTeams?: Array<{ profiles: string[] }> }> },
}))

vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({ fleetSessions: fleetSessionsRef.value, teams: [] }),
}))
vi.mock('@/custom/matrix-teams/stores/team-registry', () => ({
  useTeamRegistryStore: () => ({ accounts: accountsRef.value }),
}))
vi.mock('@/custom/loop/api/loop-rest', () => ({
  loopRest: { getContracts: vi.fn(async () => []) },
}))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ sessions: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ sortedRooms: [] }),
}))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ rooms: [] }) }))
vi.mock('@/custom/loop/store/loop', () => ({ useLoopStore: () => ({ loops: [] }) }))
vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: () => ({ runs: [] }) }))
vi.mock('../store/workspace', () => ({
  useWorkspaceStore: () => ({ tasks: [], boards: [] }),
}))

import { useSitCounts } from '../composables/useSitCounts'

beforeEach(() => {
  setActivePinia(createPinia())
  fleetSessionsRef.value = []
  accountsRef.value = []
})

describe('useSitCounts.online 兜底口径（cockpit-online-zero）', () => {
  it('registry 空时以 fleetSessions 聚合兜底，不再恒 0', () => {
    fleetSessionsRef.value = [
      { profile: 'fanfan' }, { profile: 'chen' }, { profile: 'chen' }, { profile: 'default' },
    ]
    const { online } = useSitCounts()
    expect(online.value.people).toBe(3) // profile 去重
    expect(online.value.agents).toBe(4) // 会话数
    expect(online.value.machines).toBe(4)
  })

  it('registry 有数据时维持注册口径（权威）', () => {
    accountsRef.value = [
      { agentTeams: [{ profiles: ['p1', 'p2'] }] },
      { agentTeams: [{ profiles: ['p3'] }] },
    ]
    fleetSessionsRef.value = [{ profile: 'p1' }]
    const { online } = useSitCounts()
    expect(online.value.people).toBe(2)
    expect(online.value.agents).toBe(3)
    expect(online.value.machines).toBe(1)
  })

  it('两者皆空保持 0（无实例在线是真实状态）', () => {
    const { online } = useSitCounts()
    expect(online.value).toEqual({ people: 0, agents: 0, machines: 0 })
  })
})
