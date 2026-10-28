// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/online-counts.test.ts
// Task 6 守门（2026-10-27 产品一致性收敛）：在线计数两处失真——
// ① 注册≠在线：registry accounts.length 被当在线人数（presence 可观测时，
//   注册面不得顶替真值；离线注册账号不计入 people）；
// ② FleetSession 重复计数：一个 fleet 会话（agent 会话，带 agent/profile 字段）
//   不得给人/智能体/机器各加一（profile 非人，不进 people）。
// ③ 计数与明细同源：identities 与计数出自同一 computed（机器计数 1 时明细
//   必有对应机器行；离线注册账号不残留在 identities.people）。
// 既有 sit-counts-online.test.ts 的网关真值/presence 计入/兜底取大口径继续
// 由该文件守门，本文件只钉上述收敛点。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { fleetSessionsRef, accountsRef, kanbanTasksRef, matrixRoomsRef, joinedMembersRef, platformsRef, gatewayStateRef, loggedInRef, currentUserNameRef } = vi.hoisted(() => ({
  fleetSessionsRef: { value: [] as Array<{ profile: string }> },
  accountsRef: { value: [] as Array<{ userId?: string; displayName?: string; agentTeams?: Array<{ profiles: string[] }> }> },
  kanbanTasksRef: { value: [] as Array<{ status: string; assignee?: string | null }> },
  matrixRoomsRef: { value: [] as Array<{ roomId: string }> },
  joinedMembersRef: { value: [] as Array<{ userId: string; presence: string }> },
  platformsRef: { value: [] as Array<{ name: string; state: string; profile?: string; icon: string; updated: string }> },
  gatewayStateRef: { value: 'stopped' as string },
  loggedInRef: { value: false as boolean },
  currentUserNameRef: { value: '' as string },
}))

vi.mock('@/custom/shared/store/cockpit', () => ({
  useCockpitStore: () => ({ fleetSessions: fleetSessionsRef.value, teams: [], currentUserName: currentUserNameRef.value }),
}))
vi.mock('@/custom/matrix-teams/stores/team-registry', () => ({
  useTeamRegistryStore: () => ({ accounts: accountsRef.value }),
}))
vi.mock('@/custom/loop/api/loop-rest', () => ({
  loopRest: { getContracts: vi.fn(async () => []) },
}))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ sessions: [] }) }))
// 成员 presence 真值来源＝store.getUserPresence（内部读 SDK User.presence）；
// 夹具里由 joinedMembersRef 提供「服务端看到的成员表」。
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({
    sortedRooms: matrixRoomsRef.value,
    getUserPresence: (id: string) => ({ status: joinedMembersRef.value.find(m => m.userId === id)?.presence ?? 'offline' }),
  }),
}))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ rooms: [] }) }))
vi.mock('@/custom/loop/store/loop', () => ({ useLoopStore: () => ({ loops: [] }) }))
vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: () => ({ runs: [] }) }))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({ tasks: kanbanTasksRef.value }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({
    client: {
      isLoggedIn: () => loggedInRef.value,
      getRoom: (roomId: string) => {
        if (!matrixRoomsRef.value.some(r => r.roomId === roomId)) return null
        return { getJoinedMembers: () => joinedMembersRef.value }
      },
    },
  }),
}))
vi.mock('@/custom/shared/store/workspace', () => ({
  useWorkspaceStore: () => ({ tasks: [], dailyTasks: [], simTasks: [], boards: [] }),
}))
vi.mock('../store/platforms', () => ({
  usePlatformsStore: () => ({
    gatewayState: gatewayStateRef.value,
    platforms: platformsRef.value,
    retain: vi.fn(),
    release: vi.fn(),
  }),
}))

import { useSitCounts } from '../composables/useSitCounts'

beforeEach(() => {
  setActivePinia(createPinia())
  fleetSessionsRef.value = []
  accountsRef.value = []
  kanbanTasksRef.value = []
  matrixRoomsRef.value = []
  joinedMembersRef.value = []
  platformsRef.value = []
  gatewayStateRef.value = 'stopped'
  loggedInRef.value = false
  currentUserNameRef.value = ''
})

describe('useSitCounts.online 收敛（注册≠在线 / FleetSession 不重复计数 / 计数明细同源）', () => {
  it('注册离线账号不计在线：presence 可观测（房间+成员表）时注册面不顶替真值', () => {
    matrixRoomsRef.value = [{ roomId: '!room1:localhost' }]
    joinedMembersRef.value = [{ userId: '@u1:localhost', presence: 'offline' }]
    accountsRef.value = [
      { userId: '@u1:localhost', displayName: 'U1', agentTeams: [{ profiles: ['p1'] }] },
    ]
    const { online } = useSitCounts()
    expect(online.value.people).toBe(0)
    expect(online.value.identities.people).toEqual([]) // 离线注册账号不残留明细
  })

  it('注册且 presence 在线：计入 people 一次（防矫枉过正）', () => {
    matrixRoomsRef.value = [{ roomId: '!room1:localhost' }]
    joinedMembersRef.value = [{ userId: '@u1:localhost', presence: 'online' }]
    accountsRef.value = [
      { userId: '@u1:localhost', displayName: 'U1', agentTeams: [{ profiles: ['p1'] }] },
    ]
    const { online } = useSitCounts()
    expect(online.value.people).toBe(1)
  })

  it('单个 FleetSession 不给人/agent/机器各加一：会话只计智能体与其宿主机，不计人', () => {
    fleetSessionsRef.value = [{ profile: 'p9' }]
    const { online } = useSitCounts()
    expect(online.value.people).toBe(0)      // agent 会话的 profile 不是人
    expect(online.value.agents).toBe(1)      // 会话=1 个智能体
    expect(online.value.machines).toBe(1)    // 会话宿主机=1 台机器
    expect(online.value.identities.people).toEqual([])
  })

  it('人=presence 在线集 ∪ 登录本人（union，本人不在 presence 集时不被 max 吞掉）', () => {
    matrixRoomsRef.value = [{ roomId: '!room1:localhost' }]
    joinedMembersRef.value = [
      { userId: '@alice:localhost', presence: 'online' },
      { userId: '@bob:localhost', presence: 'online' },
    ]
    currentUserNameRef.value = 'fanfan'
    const { online } = useSitCounts()
    expect(online.value.people).toBe(3)
    expect(online.value.identities.people).toEqual(
      expect.arrayContaining(['@alice:localhost', '@bob:localhost', 'fanfan']),
    )
  })

  it('计数与明细同源：机器计数=1（网关实例）时明细必有 1 行机器；智能体明细=网关连通档案', () => {
    gatewayStateRef.value = 'running'
    platformsRef.value = [
      { name: 'matrix', state: 'connected', profile: 'fanfan', icon: 'users', updated: '' },
      { name: 'matrix', state: 'connected', profile: 'chen', icon: 'users', updated: '' },
    ]
    const { online } = useSitCounts()
    expect(online.value.machines).toBe(1)
    expect(online.value.identities.machines).toHaveLength(1)
    expect(online.value.agents).toBe(2)
    expect(online.value.identities.agents).toEqual(['fanfan', 'chen'])
  })
})
