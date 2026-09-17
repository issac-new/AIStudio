// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/duty-panel.test.ts
// 值守守门：leader 才能写 duty；覆盖写带 updatedBy/updatedAt；非 leader 拒绝；
// DutyAssignPanel 渲染既有值守、指派（房间+目标下拉）、清除（空 content 覆盖同 state_key）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { TEAM_EVENT_TYPES, REGISTRY_ACCOUNT_DATA_TYPE } from '../protocol'

// 非_leader 用例需切换当前登录账号：mock 的 userId 必须是真 ref——
// 普通 { value } 对象无响应性，store 的 userIdRef/isLeader computed 不会因切换而失效（P1 坑）。
const mockClient = vi.hoisted(() => ({ userIdRef: null as unknown as { value: string } }))

// state 事件按 SDK MatrixEvent 形态存（getType/getStateKey/getContent + sender.userId），
// 与简报原稿事件形态一致；extractStateEvents 对该形态有原生分支。
const mkEvent = (type: string, stateKey: string, sender: string, content: unknown) => ({
  getType: () => type,
  getStateKey: () => stateKey,
  getContent: () => content,
  sender: { userId: sender },
})

/** 初始房间 state：注册房间含 leaders/account/一条既有 duty（!room1:sv 守给 @bob:sv）。 */
function freshRoomStates(): Record<string, ReturnType<typeof mkEvent>[]> {
  return {
    '!reg:sv': [
      mkEvent(TEAM_EVENT_TYPES.leaders, '', '@alice:sv', { leaders: ['@alice:sv'] }),
      mkEvent(TEAM_EVENT_TYPES.account, '@bob:sv', '@bob:sv', { displayName: 'bob', agentTeams: [{ slug: 'ops', name: 'Ops', profiles: ['pb'] }], updatedAt: 1 }),
      mkEvent(TEAM_EVENT_TYPES.duty, '!room1:sv', '@alice:sv', { assigneeKind: 'account', assigneeId: '@bob:sv', updatedBy: '@alice:sv', updatedAt: 5 }),
    ],
  }
}
const roomStates = freshRoomStates()

const sentState: Array<{ roomId: string; type: string; stateKey: string; content: unknown }> = []

const sdk = {
  client: {
    on: () => {}, off: () => {},
    getAccountData: (t: string) => t === REGISTRY_ACCOUNT_DATA_TYPE ? { content: { roomId: '!reg:sv' } } : undefined,
    setAccountData: async () => {},
    getRoom: (roomId: string) => ({
      roomId,
      getJoinedMembers: () => [{ userId: '@alice:sv' }, { userId: '@bob:sv' }],
      currentState: { getStateEvents: (type?: string) => (roomStates[roomId] ?? []).filter(e => e.getType() === type) },
    }),
    // 简报适配：原稿 getRooms() 恒 []，与 P1 定稿契约冲突——detectRegistry 的 roomVisible
    // 要求注册房间出现在 getRooms() 中，否则 registryRoomId 置空、isLeader 恒 false，
    // 「leader 写 duty」断言无法成立。返回注册房间本身。
    getRooms: () => [sdk.client.getRoom('!reg:sv')],
    // mock 保真：真实 SDK 中新 state 事件按 (type, state_key) 覆盖 currentState 旧条目
    //（P1 makeSdkClient 追加语义不适用于覆盖写场景：clear 后旧 duty 残留会污染投影）。
    sendStateEvent: async (roomId: string, type: string, content: unknown, stateKey: string) => {
      sentState.push({ roomId, type, stateKey, content })
      const kept = (roomStates[roomId] ?? []).filter(e => !(e.getType() === type && e.getStateKey() === stateKey))
      roomStates[roomId] = [...kept, mkEvent(type, stateKey, mockClient.userIdRef.value, content)]
    },
  },
}

vi.mock('@/custom/matrix-chat/stores/matrix-client', async () => {
  const { ref } = await import('vue')
  mockClient.userIdRef = ref('@alice:sv')
  return {
    useMatrixClientStore: () => ({ client: { value: sdk.client }, userId: mockClient.userIdRef }),
  }
})
vi.mock('@/custom/matrix-chat/stores/matrix-room', async () => {
  const { ref, reactive } = await import('vue')
  // mock store 响应性（P1 坑）：ref + reactive 包装，等价 pinia store 的 ref 解包语义；
  // 裸 { value } 对象会让组件的 roomStore.sortedRooms 拿到非数组。
  return {
    useMatrixRoomStore: () => reactive({
      sortedRooms: ref([
        { roomId: '!room1:sv', name: '客户一群' },
        { roomId: '!room2:sv', name: '客户二群' },
      ]),
    }),
  }
})

import { useTeamRegistryStore } from '../stores/team-registry'
import DutyAssignPanel from '../components/DutyAssignPanel.vue'

const i18n = createI18n({
  legacy: false, locale: 'zh', missingWarn: false, fallbackWarn: false,
  messages: { zh: { teams: { duty: {
    title: '群聊值守', chooseRoom: '选择房间', to: '值守给', assign: '指派', clear: '清除',
  } } } },
})

function mountPanel() {
  return mount(DutyAssignPanel, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  sentState.length = 0
  mockClient.userIdRef.value = '@alice:sv'
  // 用例间复位注册房间 state（组件用例的指派/清除会落盘污染共享 mock；state 只写 '!reg:sv'）
  roomStates['!reg:sv'] = freshRoomStates()['!reg:sv']
})

describe('writeDuty / clearDuty', () => {
  it('leader 写 duty：state_key=房间 id，content 含 updatedBy/updatedAt', async () => {
    const store = useTeamRegistryStore()
    await store.detectRegistry()
    expect(store.isLeader).toBe(true)
    const ok = await store.writeDuty('!room2:sv', { assigneeKind: 'agentTeam', assigneeId: '@bob:sv/ops', roomName: '客户二群' })
    expect(ok).toBe(true)
    const w = sentState.find(s => s.type === TEAM_EVENT_TYPES.duty && s.stateKey === '!room2:sv')
    expect(w).toBeTruthy()
    expect(w!.content).toMatchObject({ assigneeKind: 'agentTeam', assigneeId: '@bob:sv/ops', updatedBy: '@alice:sv' })
    expect(typeof (w!.content as { updatedAt: number }).updatedAt).toBe('number')
  })
  it('rebuild 后 duties 含既有值守；clearDuty 用空 content 覆盖', async () => {
    const store = useTeamRegistryStore()
    await store.detectRegistry()
    expect(store.duties['!room1:sv']).toMatchObject({ assigneeKind: 'account', assigneeId: '@bob:sv' })
    expect(await store.clearDuty('!room1:sv')).toBe(true)
    expect(sentState.find(s => s.stateKey === '!room1:sv')!.content).toEqual({})
  })
  it('非 leader 拒绝：writeDuty/clearDuty 返回 false 且不发 state', async () => {
    const store = useTeamRegistryStore()
    await store.detectRegistry()
    expect(store.isLeader).toBe(true)
    mockClient.userIdRef.value = '@mallory:sv' // 切到非 leader 账号（不在 leaders 列表）
    expect(store.isLeader).toBe(false)
    expect(await store.writeDuty('!room2:sv', { assigneeKind: 'account', assigneeId: '@mallory:sv' })).toBe(false)
    expect(await store.clearDuty('!room1:sv')).toBe(false)
    expect(sentState.filter(s => s.type === TEAM_EVENT_TYPES.duty)).toHaveLength(0)
  })
})

describe('DutyAssignPanel 组件', () => {
  it('渲染既有值守列表（无 roomName 回退 roomId）；leader 显示指派表单，非 leader 隐藏', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="duty-panel"]').exists()).toBe(true)
    const list = w.find('[data-testid="duty-list"]')
    expect(list.text()).toContain('!room1:sv')
    expect(list.text()).toContain('@bob:sv')
    expect(w.find('[data-testid="duty-assign"]').exists()).toBe(true)
    mockClient.userIdRef.value = '@mallory:sv'
    await flushPromises()
    expect(w.find('[data-testid="duty-assign"]').exists()).toBe(false)
  })
  it('选房间+目标（agentTeam 全局 id）→ 指派：写 duty state 且列表刷新出新行', async () => {
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-testid="duty-room-select"]').setValue('!room2:sv')
    await w.find('[data-testid="duty-target-select"]').setValue('@bob:sv/ops')
    await w.find('[data-testid="duty-assign"]').trigger('click')
    await flushPromises()
    const wState = sentState.find(s => s.type === TEAM_EVENT_TYPES.duty && s.stateKey === '!room2:sv')
    expect(wState).toBeTruthy()
    expect(wState!.content).toMatchObject({ assigneeKind: 'agentTeam', assigneeId: '@bob:sv/ops', roomName: '客户二群', updatedBy: '@alice:sv' })
    expect(w.find('[data-testid="duty-list"]').text()).toContain('客户二群')
  })
  it('选房间+目标（account 账号）→ 指派：assigneeKind 按 target.kind 判定为 account', async () => {
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-testid="duty-room-select"]').setValue('!room2:sv')
    await w.find('[data-testid="duty-target-select"]').setValue('@bob:sv')
    await w.find('[data-testid="duty-assign"]').trigger('click')
    await flushPromises()
    const wState = sentState.find(s => s.type === TEAM_EVENT_TYPES.duty && s.stateKey === '!room2:sv')
    expect(wState).toBeTruthy()
    expect(wState!.content).toMatchObject({ assigneeKind: 'account', assigneeId: '@bob:sv', roomName: '客户二群', updatedBy: '@alice:sv' })
  })
  it('清除按钮 → 空 content 覆盖同 state_key，列表移除该行（解析失败视为无值守）', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="duty-list"]').text()).toContain('!room1:sv')
    await w.find('[data-testid="duty-clear"]').trigger('click')
    await flushPromises()
    expect(sentState.find(s => s.type === TEAM_EVENT_TYPES.duty && s.stateKey === '!room1:sv')!.content).toEqual({})
    expect(w.find('[data-testid="duty-list"]').text()).not.toContain('!room1:sv')
  })
})
