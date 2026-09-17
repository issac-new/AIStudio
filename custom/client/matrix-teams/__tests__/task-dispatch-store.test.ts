// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/task-dispatch-store.test.ts
// 投递守门：发送带 uuid+issuedBy；外派视图 assign∪receipt 幂等合并（最新 reportedAt 胜）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { TASK_EVENT_TYPES, TEAM_EVENT_TYPES, REGISTRY_ACCOUNT_DATA_TYPE, type AssignContent, type ReceiptContent } from '../protocol'

const sentEvents: Array<{ roomId: string; type: string; content: unknown }> = []
const listeners = new Map<string, Array<(e: unknown, r: unknown) => void>>()
// 历史窗口：模拟「监听挂载前就在房间里」的 timeline 事件（getLiveTimeline().getEvents() 读取）。
let historyEvents: unknown[] = []
const sdkClient = {
  on: (ev: string, fn: (e: unknown, r: unknown) => void) => { listeners.set(ev, [...(listeners.get(ev) ?? []), fn]) },
  off: () => {},
  sendEvent: async (roomId: string, type: string, content: unknown) => { sentEvents.push({ roomId, type, content }) },
  getAccountData: (t: string) => t === REGISTRY_ACCOUNT_DATA_TYPE ? { content: { roomId: '!reg:sv' } } : undefined,
  scrollback: async (room: unknown) => room,
  getRoom: () => ({
    roomId: '!reg:sv',
    getJoinedMembers: () => [],
    currentState: { getStateEvents: () => [] },
    getLiveTimeline: () => ({ getEvents: () => historyEvents }),
  }),
}
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdkClient }, userId: { value: '@alice:sv' } }),
}))
vi.mock('../stores/team-registry', () => ({
  useTeamRegistryStore: () => ({ registryRoomId: { value: '!reg:sv' }, accounts: { value: [] }, isLeader: { value: true } }),
}))

import { useTaskDispatchStore } from '../stores/task-dispatch'

beforeEach(() => {
  setActivePinia(createPinia())
  sentEvents.length = 0
  historyEvents = []
  localStorage.clear()
  listeners.clear()
})

const assignOf = (over: Partial<AssignContent>): AssignContent => ({
  taskId: 't1', title: 'T', target: { account: '@bob:sv' }, issuedBy: '@alice:sv', issuedAt: 10, ...over,
})
const receiptOf = (over: Partial<ReceiptContent>): ReceiptContent => ({
  taskId: 't1', status: 'created', reportedBy: '@bob:sv', reportedAt: 20, ...over,
})
const sdkEv = (type: string, content: unknown) => ({
  getType: () => type, isState: () => false, sender: { userId: '@x:sv' }, getContent: () => content,
})
const roomStub = { roomId: '!reg:sv' }

describe('sendAssignment', () => {
  it('生成 uuid taskId 并 sendEvent assign（含 issuedBy/issuedAt）', async () => {
    const store = useTaskDispatchStore()
    const ok = await store.sendAssignment({ title: '做蛋糕', target: { account: '@bob:sv', agentTeam: 'ops' } })
    expect(ok).toBe(true)
    expect(sentEvents).toHaveLength(1)
    expect(sentEvents[0]).toMatchObject({ roomId: '!reg:sv', type: TASK_EVENT_TYPES.assign })
    const c = sentEvents[0].content as AssignContent
    expect(c.taskId).toMatch(/^[0-9a-f-]{36}$/)
    expect(c.title).toBe('做蛋糕')
    expect(c.target).toEqual({ account: '@bob:sv', agentTeam: 'ops', profile: undefined })
    expect(c.issuedBy).toBe('@alice:sv')
  })
})

describe('外派视图聚合', () => {
  it('assign 入视图；receipt 按 taskId 合并，旧 reportedAt 不覆盖新', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, assignOf({})), roomStub)
    expect(store.dispatches).toHaveLength(1)
    expect(store.dispatches[0].receipt).toBeNull()
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, receiptOf({ status: 'created', reportedAt: 20 })), roomStub)
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, receiptOf({ status: 'running', reportedAt: 30 })), roomStub)
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, receiptOf({ status: 'created', reportedAt: 25 })), roomStub) // 迟到旧回执
    expect(store.dispatches[0].receipt?.status).toBe('running')
    expect(store.dispatches).toHaveLength(1)
  })
  it('非法 content（解析失败）与外房间事件不进视图', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, { taskId: 1 }), roomStub)
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, receiptOf({})), { roomId: '!other:sv' })
    expect(store.dispatches).toHaveLength(0)
  })
  it('同 taskId 重复 assign（重复投递）视图不重复', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, assignOf({})), roomStub)
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, assignOf({})), roomStub)
    expect(store.dispatches).toHaveLength(1)
  })
})

// ── Important-1 守门：watcher 绑 pinia effect scope，组件无关 ──
describe('监听生命周期（store setup 顶层挂载）', () => {
  it('实例化 store 即挂 1 个 Room.timeline 监听，无需组件 onMounted；ensureListening 幂等', async () => {
    const store = useTaskDispatchStore()
    await nextTick()
    expect((listeners.get('Room.timeline') ?? [])).toHaveLength(1)
    store.ensureListening()
    store.ensureListening()
    await nextTick()
    expect((listeners.get('Room.timeline') ?? [])).toHaveLength(1)
  })
})

// ── Important-2 守门：历史回填（监听挂载前到达的 assign/receipt 不丢）──
describe('历史回填', () => {
  it('历史窗口里的 assign/receipt 回填进视图：leader 视角补出全量外派列表', async () => {
    historyEvents = [
      sdkEv(TASK_EVENT_TYPES.assign, assignOf({ taskId: 'hist-1', title: '历史任务' })),
      sdkEv(TASK_EVENT_TYPES.receipt, receiptOf({ taskId: 'hist-1', status: 'done', reportedAt: 30 })),
      sdkEv('m.room.message', { body: '无关消息' }),
    ]
    const store = useTaskDispatchStore()
    await vi.waitFor(() => expect(store.dispatches).toHaveLength(1))
    expect(store.dispatches[0]).toMatchObject({
      assign: { taskId: 'hist-1', title: '历史任务' },
      receipt: { status: 'done', reportedAt: 30 },
    })
    // 历史中的 assign 目标不是本账号（@alice:sv）→ 不触发 receiveAssign 建卡
    expect(localStorage.getItem('matrix-teams.dispatchIndex')).toBeNull()
  })
  it('backfillHistory 幂等：同一房间重复调用不重复回放处理', async () => {
    historyEvents = [sdkEv(TASK_EVENT_TYPES.assign, assignOf({ taskId: 'hist-2' }))]
    const store = useTaskDispatchStore()
    await vi.waitFor(() => expect(store.dispatches).toHaveLength(1))
    await store.backfillHistory()
    await store.backfillHistory()
    expect(store.dispatches).toHaveLength(1)
  })
})
