// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/team-registry-store.test.ts
// 注册房间 store 守门：发现/建房 PL/写 account 归属校验/rebuild 投影/幂等监听。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { TEAM_EVENT_TYPES, REGISTRY_ACCOUNT_DATA_TYPE, REGISTRY_ROOM_POWER_LEVELS } from '../protocol'

type Listener = (event: unknown, room: unknown) => void

function makeSdkClient(roomStates: Record<string, Array<{ type: string; stateKey: string; sender: string; content: unknown }>> = {}) {
  const listeners = new Map<string, Listener[]>()
  const accountData = new Map<string, unknown>()
  const sent = { stateEvents: [] as Array<{ roomId: string; type: string; stateKey: string; content: unknown }>, accountData: [] as string[] }
  const client = {
    on: (ev: string, fn: Listener) => { listeners.set(ev, [...(listeners.get(ev) ?? []), fn]) },
    off: () => {},
    getAccountData: (type: string) => accountData.get(type) !== undefined ? { content: accountData.get(type) } : undefined,
    setAccountData: async (type: string, content: unknown) => { accountData.set(type, content); sent.accountData.push(type) },
    getRoom: (roomId: string) => {
      const states = roomStates[roomId] ?? []
      return {
        roomId,
        name: roomId,
        getJoinedMembers: () => (roomStates[roomId] ?? []).map(s => ({ userId: s.sender, membership: 'join' })),
        currentState: {
          getStateEvents: (type?: string) => type === undefined ? states : states.filter(s => s.type === type),
        },
      }
    },
    getRooms: () => Object.keys(roomStates).map(id => client.getRoom(id)),
    createRoom: vi.fn(async () => ({ room_id: '!new:sv' })),
    sendStateEvent: async (roomId: string, type: string, content: unknown, stateKey: string) => {
      sent.stateEvents.push({ roomId, type, stateKey, content })
      roomStates[roomId] = [...(roomStates[roomId] ?? []), { type, stateKey, sender: stateKey, content }]
    },
    invite: vi.fn(async () => ({})),
    sendEvent: vi.fn(async () => ({})),
    userId: '@alice:sv',
  }
  return {
    client,
    emit: (ev: string, event: unknown, room: unknown) => {
      // mock 保真补齐（brief Step 4 口径）：真实 SDK 中 timeline 上的 state 事件会同步落入
      // room.currentState；不落盘的话 rebuild 型监听永远看不到增量事件。
      const e = event as { isState?: () => boolean; getType?: () => string; getStateKey?: () => string; sender?: { userId?: string }; getContent?: () => unknown }
      const rid = (room as { roomId?: string } | undefined)?.roomId
      if (ev === 'Room.timeline' && rid && typeof e?.isState === 'function' && e.isState()
        && typeof e.getType === 'function' && typeof e.getStateKey === 'function' && typeof e.getContent === 'function') {
        roomStates[rid] = [...(roomStates[rid] ?? []), {
          type: e.getType(), stateKey: e.getStateKey() ?? '', sender: e.sender?.userId ?? '', content: e.getContent(),
        }]
      }
      ;(listeners.get(ev) ?? []).forEach(fn => fn(event, room))
    },
    accountData, sent, listeners,
    sdkEvent: (roomId: string, s: { type: string; stateKey: string; sender: string; content: unknown }) => ({
      getType: () => s.type, getStateKey: () => s.stateKey,
      sender: { userId: s.sender }, getContent: () => s.content,
      isState: () => true, getRoomId: () => roomId,
    }),
  }
}

const sdk = makeSdkClient({
  '!reg:sv': [
    { type: TEAM_EVENT_TYPES.leaders, stateKey: '', sender: '@lead:sv', content: { leaders: ['@lead:sv'] } },
    { type: TEAM_EVENT_TYPES.account, stateKey: '@bob:sv', sender: '@bob:sv', content: { displayName: 'Bob', agentTeams: [{ slug: 'main', name: 'Main', profiles: ['pb'] }], updatedAt: 9 } },
  ],
  '!plain:sv': [
    { type: 'm.room.name', stateKey: '', sender: '@x:sv', content: { name: 'plain' } },
  ],
})

vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdk.client }, userId: { value: '@alice:sv' } }),
}))

import { useTeamRegistryStore } from '../stores/team-registry'

beforeEach(() => {
  setActivePinia(createPinia())
  // 用例隔离：模块级 sdk mock 的发送记录与 account data 在用例间清零。
  // brief 原稿缺此清理——「写 account」用例 A 的发送会泄漏进用例 B 的「不动 SDK」零断言。
  sdk.sent.stateEvents.length = 0
  sdk.sent.accountData.length = 0
  sdk.accountData.clear()
  // ensureListening 迁移到 store setup 顶层后，每个用例实例化 store 即向模块级
  // sdk.client 挂一个 Timeline 监听（mock 的 off 是 no-op 卸不掉）。用例间清空，
  // 「只挂一次监听」断言度量本用例内的挂载次数。
  sdk.listeners.clear()
})

describe('发现', () => {
  it('account data 已记 roomId 且房间可见 → registryRoomId 命中', async () => {
    sdk.accountData.set(REGISTRY_ACCOUNT_DATA_TYPE, { roomId: '!reg:sv' })
    const store = useTeamRegistryStore()
    await store.detectRegistry()
    expect(store.registryRoomId).toBe('!reg:sv')
  })
  it('account data 指向不存在房间 → 置空（可走候选兜底）', async () => {
    sdk.accountData.set(REGISTRY_ACCOUNT_DATA_TYPE, { roomId: '!gone:sv' })
    const store = useTeamRegistryStore()
    await store.detectRegistry()
    expect(store.registryRoomId).toBeNull()
  })
  it('候选兜底 = 含 team.* state 的已加入房间', () => {
    const store = useTeamRegistryStore()
    const cands = store.registryCandidateRooms()
    expect(cands.map(c => c.roomId)).toContain('!reg:sv')
    expect(cands.map(c => c.roomId)).not.toContain('!plain:sv')
  })
})

describe('rebuild 投影', () => {
  it('leaders + accounts 投影，伪造条目（sender≠stateKey）丢弃', async () => {
    sdk.client.getRoom('!reg:sv').currentState.getStateEvents().push(
      { type: TEAM_EVENT_TYPES.account, stateKey: '@fake:sv', sender: '@mallory:sv', content: { displayName: 'F', agentTeams: [], updatedAt: 1 } },
    )
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    await store.rebuild()
    expect(store.leaders).toEqual(['@lead:sv'])
    expect(store.accounts.map(a => a.userId)).toEqual(['@bob:sv'])
    expect(store.ready).toBe(true)
  })
  it('房间消失（getRoom 返回 null）→ 四类投影清空 + ready=false', async () => {
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    await store.rebuild()
    expect(store.accounts.length).toBeGreaterThan(0)
    expect(store.leaders).toEqual(['@lead:sv'])
    const spy = vi.spyOn(sdk.client, 'getRoom').mockReturnValue(null)
    await store.rebuild()
    expect(store.ready).toBe(false)
    expect(store.accounts).toEqual([])
    expect(store.leaders).toEqual([])
    expect(store.undeclared).toEqual([])
    expect(store.duties).toEqual({})
    spy.mockRestore()
  })
})

describe('建房（leader）', () => {
  it('createRoom 带 PL 覆盖 + 写 account data + 写 leaders state', async () => {
    const store = useTeamRegistryStore()
    const roomId = await store.createRegistryRoom('Swarm Teams', ['@bob:sv'])
    expect(roomId).toBe('!new:sv')
    expect(sdk.client.createRoom).toHaveBeenCalledWith(expect.objectContaining({
      visibility: 'private',
      name: 'Swarm Teams',
      invite: ['@bob:sv'],
      power_level_content_override: REGISTRY_ROOM_POWER_LEVELS,
    }))
    expect(sdk.sent.accountData).toContain(REGISTRY_ACCOUNT_DATA_TYPE)
    const leadersWrite = sdk.sent.stateEvents.find(s => s.type === TEAM_EVENT_TYPES.leaders)
    expect(leadersWrite?.content).toEqual({ leaders: ['@alice:sv'] })
    expect(store.registryRoomId).toBe('!new:sv')
  })
})

describe('写 account（成员自声明）', () => {
  it('sendStateEvent 到注册房间，stateKey=自己 userId', async () => {
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    const ok = await store.writeSelfAccount([{ slug: 'dev', name: 'Dev', profiles: ['pa'], defaultProfile: 'pa' }])
    expect(ok).toBe(true)
    const w = sdk.sent.stateEvents.find(s => s.type === TEAM_EVENT_TYPES.account && s.stateKey === '@alice:sv')
    expect(w).toBeTruthy()
    expect((w!.content as { agentTeams: unknown[] }).agentTeams).toHaveLength(1)
  })
  it('未配置注册房间 → false 且不动 SDK', async () => {
    const store = useTeamRegistryStore()
    expect(await store.writeSelfAccount([])).toBe(false)
    expect(sdk.sent.stateEvents.filter(s => s.type === TEAM_EVENT_TYPES.account)).toHaveLength(0)
  })
  it('写失败置 lastError；重试成功清掉旧错误（成功路径不清错误会滞留）', async () => {
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    const spy = vi.spyOn(sdk.client, 'sendStateEvent').mockRejectedValueOnce(new Error('net down'))
    expect(await store.writeSelfAccount([{ slug: 'dev', name: 'Dev', profiles: ['pa'] }])).toBe(false)
    expect(store.lastError).toBe('net down')
    expect(await store.writeSelfAccount([{ slug: 'dev', name: 'Dev', profiles: ['pa'] }])).toBe(true)
    expect(store.lastError).toBeNull()
    spy.mockRestore()
  })
  it('writeLeaders/inviteMember 同款：失败后重试成功清 lastError', async () => {
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    const spy = vi.spyOn(sdk.client, 'sendStateEvent').mockRejectedValueOnce(new Error('boom'))
    expect(await store.writeLeaders(['@alice:sv'])).toBe(false)
    expect(store.lastError).toBe('boom')
    expect(await store.writeLeaders(['@alice:sv'])).toBe(true)
    expect(store.lastError).toBeNull()
    spy.mockRestore()
    const inviteSpy = vi.spyOn(sdk.client, 'invite').mockRejectedValueOnce(new Error('invite fail'))
    expect(await store.inviteMember('@mallory:sv')).toBe(false)
    expect(store.lastError).toBe('invite fail')
    expect(await store.inviteMember('@mallory:sv')).toBe(true)
    expect(store.lastError).toBeNull()
    inviteSpy.mockRestore()
  })
  it('writeDuty/clearDuty 同款：失败后重试成功清 lastError', async () => {
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    // unshift 置于队首：rebuild 的 find 取首个 leaders 事件 → @alice:sv 成 leader，
    // writeDuty 的 isLeader 门禁才能通过（append 会被原 ['@lead:sv'] 条目抢先）。
    sdk.client.getRoom('!reg:sv').currentState.getStateEvents().unshift(
      { type: TEAM_EVENT_TYPES.leaders, stateKey: '', sender: '@alice:sv', content: { leaders: ['@alice:sv'] } },
    )
    await store.rebuild()
    expect(store.isLeader).toBe(true)
    store.lastError = 'stale'
    const spy = vi.spyOn(sdk.client, 'sendStateEvent').mockRejectedValueOnce(new Error('duty fail'))
    expect(await store.writeDuty('!room9:sv', { assigneeKind: 'account', assigneeId: '@bob:sv' })).toBe(false)
    expect(store.lastError).toBe('duty fail')
    expect(await store.writeDuty('!room9:sv', { assigneeKind: 'account', assigneeId: '@bob:sv' })).toBe(true)
    expect(store.lastError).toBeNull()
    spy.mockRestore()
    const clearSpy = vi.spyOn(sdk.client, 'sendStateEvent').mockRejectedValueOnce(new Error('clear fail'))
    expect(await store.clearDuty('!room9:sv')).toBe(false)
    expect(store.lastError).toBe('clear fail')
    expect(await store.clearDuty('!room9:sv')).toBe(true)
    expect(store.lastError).toBeNull()
    clearSpy.mockRestore()
  })
})

describe('ensureListening 幂等 + 增量触发 rebuild', () => {
  it('两次 ensureListening 只挂一次监听；Timeline 相关事件触发投影刷新', async () => {
    const store = useTeamRegistryStore()
    store.attachRoom('!reg:sv')
    store.ensureListening()
    store.ensureListening()
    await nextTick()
    expect((sdk.listeners.get('Room.timeline') ?? [])).toHaveLength(1)
    const before = store.accounts.length
    sdk.emit('Room.timeline', sdk.sdkEvent('!reg:sv', { type: TEAM_EVENT_TYPES.account, stateKey: '@carol:sv', sender: '@carol:sv', content: { displayName: 'Carol', agentTeams: [], updatedAt: 2 } }), sdk.client.getRoom('!reg:sv'))
    await nextTick()
    await Promise.resolve()
    expect(store.accounts.length).toBe(before + 1)
    sdk.emit('Room.timeline', sdk.sdkEvent('!reg:sv', { type: 'm.room.message', stateKey: '', sender: '@x:sv', content: {} }), sdk.client.getRoom('!reg:sv'))
    await nextTick()
    expect(store.accounts.length).toBe(before + 1) // 无关事件不触发
  })
})
