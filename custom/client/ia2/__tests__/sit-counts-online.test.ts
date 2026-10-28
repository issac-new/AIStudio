// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sit-counts-online.test.ts
// cockpit-online-zero 守门（aipaydev 推演实锤）：team-registry 空（未登录 Matrix /
// 团队未注册）时，people/agents 不得恒 0——以 fleetSessions 聚合兜底；
// registry 有数据时维持原口径。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { fleetSessionsRef, accountsRef, kanbanTasksRef, matrixRoomsRef, joinedMembersRef, platformsRef, gatewayStateRef, loggedInRef, currentUserNameRef } = vi.hoisted(() => ({
  fleetSessionsRef: { value: [] as Array<{ profile: string }> },
  accountsRef: { value: [] as Array<{ agentTeams?: Array<{ profiles: string[] }> }> },
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

describe('useSitCounts.online 兜底口径（cockpit-online-zero）', () => {
  it('registry 空时以 fleetSessions 聚合兜底，不再恒 0', () => {
    fleetSessionsRef.value = [
      { profile: 'fanfan' }, { profile: 'chen' }, { profile: 'chen' }, { profile: 'default' },
    ]
    const { online } = useSitCounts()
    // Task 6（2026-10-27）失真②修复：fleet 会话的 profile 是智能体档案而非人，
    // 不再计入 people（原断言 people=3 即「单会话给人加一」失真本体）。
    // 「不再恒 0」守门语义由 agents/machines 的 fleet 兜底继续承担。
    expect(online.value.people).toBe(0)
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
    expect(online.value).toEqual({ people: 0, agents: 0, machines: 0, identities: { people: [], agents: [], machines: [] } })
  })

  it('网关真值（cockpit-online-zero 根治）：fleet 空时机器=网关实例、智能体=连通通道档案、人≥登录本人', () => {
    gatewayStateRef.value = 'running'
    platformsRef.value = [
      { name: 'matrix', state: 'connected', profile: 'fanfan', icon: 'users', updated: '' },
      { name: 'matrix', state: 'connected', profile: 'chen', icon: 'users', updated: '' },
      { name: 'matrix', state: 'stopped', profile: 'hu', icon: 'users', updated: '' },
    ]
    loggedInRef.value = true
    const { online } = useSitCounts()
    expect(online.value.machines).toBe(1) // 网关 running 即 1 台机器
    expect(online.value.agents).toBe(2)   // 连通通道去重档案 fanfan/chen
    expect(online.value.people).toBeGreaterThanOrEqual(1) // 本人已登录即在线
  })

  it('网关停止且无会话时在线为 0（真实停机态）', () => {
    gatewayStateRef.value = 'stopped'
    loggedInRef.value = false
    const { online } = useSitCounts()
    expect(online.value.machines).toBe(0)
  })

  it('动态探测：Matrix presence 在线账号计入 people（2026-09-23 用户裁决）', () => {
    matrixRoomsRef.value = [{ roomId: '!room1:localhost' }]
    joinedMembersRef.value = [
      { userId: '@alice:localhost', presence: 'online' },
      { userId: '@bob:localhost', presence: 'online' },
      { userId: '@carol:localhost', presence: 'offline' },
    ]
    const { online } = useSitCounts()
    expect(online.value.people).toBe(2)
  })

  it('动态探测：看板 running 任务 assignee 去重计入 agents（覆盖 gateway 跑任务非 studio 会话）', () => {
    kanbanTasksRef.value = [
      { status: 'running', assignee: 'chen' },
      { status: 'running', assignee: 'xiao' },
      { status: 'running', assignee: 'chen' },
      { status: 'todo', assignee: 'qi' },
    ]
    const { online } = useSitCounts()
    expect(online.value.agents).toBe(2)
  })

  it('动态探测与 fleet 兜底取大（agents 口径）', () => {
    fleetSessionsRef.value = [{ profile: 'a' }, { profile: 'b' }, { profile: 'c' }]
    kanbanTasksRef.value = [{ status: 'running', assignee: 'x' }]
    const { online } = useSitCounts()
    expect(online.value.agents).toBe(3)
  })

  it('人≥登录本人：matrix client 未建连但 cockpit 会话在 → people ≥ 1（run5 驾驶舱首屏口径）', () => {
    currentUserNameRef.value = 'fanfan'
    const { online } = useSitCounts()
    expect(online.value.people).toBeGreaterThanOrEqual(1)
  })
})
