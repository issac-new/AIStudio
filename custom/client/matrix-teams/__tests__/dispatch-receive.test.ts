// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/dispatch-receive.test.ts
// 接收落地守门：目标三级回退、kv 防重、建卡参数、created/failed 回执路径。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { TASK_EVENT_TYPES, type AssignContent } from '../protocol'
import { resolveTargetProfile, mapKanbanStatusToReceipt } from '../adapters/dispatch-target'
import type { TeamAccountView } from '../adapters/accounts'

const accounts: TeamAccountView[] = [
  { userId: '@bob:sv', displayName: 'bob', isLeader: false, declared: true, agentTeams: [
    { slug: 'ops', name: 'Ops', profiles: ['pb1', 'pb2'], defaultProfile: 'pb2' },
    { slug: 'dev', name: 'Dev', profiles: ['pb3'] },
  ] },
]

describe('resolveTargetProfile（三级回退）', () => {
  it('显式 profile 最优先', () => {
    expect(resolveTargetProfile({ account: '@bob:sv', agentTeam: 'ops', profile: 'pb1' }, accounts)).toBe('pb1')
  })
  it('其次 team.defaultProfile，再次 profiles[0]', () => {
    expect(resolveTargetProfile({ account: '@bob:sv', agentTeam: 'ops' }, accounts)).toBe('pb2')
    expect(resolveTargetProfile({ account: '@bob:sv', agentTeam: 'dev' }, accounts)).toBe('pb3')
  })
  it('无 team 时取账号首个 team 的 defaultProfile', () => {
    expect(resolveTargetProfile({ account: '@bob:sv' }, accounts)).toBe('pb2')
  })
  it('账号不存在 / team 不存在 / 账号无 team → null', () => {
    expect(resolveTargetProfile({ account: '@nobody:sv' }, accounts)).toBeNull()
    expect(resolveTargetProfile({ account: '@bob:sv', agentTeam: 'nope' }, accounts)).toBeNull()
    expect(resolveTargetProfile({ account: '@bob:sv' }, [{ ...accounts[0], agentTeams: [] }])).toBeNull()
  })
})

describe('mapKanbanStatusToReceipt', () => {
  it('四桶映射 + 未知兜底 running', () => {
    expect(mapKanbanStatusToReceipt('todo')).toBe('created')
    expect(mapKanbanStatusToReceipt('running')).toBe('running')
    expect(mapKanbanStatusToReceipt('done')).toBe('done')
    expect(mapKanbanStatusToReceipt('blocked')).toBe('failed')
    expect(mapKanbanStatusToReceipt('weird')).toBe('running')
  })
})

// ── receiveAssign 落地路径 ──
const created: Array<Record<string, unknown>> = []
const sentEvents: Array<{ type: string; content: Record<string, unknown> }> = []
// 历史窗口：「监听挂载前就在注册房间里」的 timeline 事件（模拟成员重启/首次打开前到达的 assign）。
let historyEvents: unknown[] = []
const kanbanApi = vi.hoisted(() => ({
  createTask: vi.fn(async (data: Record<string, unknown>) => {
    created.push(data)
    return { id: 'kb-1', status: 'ready', title: String(data.title) }
  }),
}))
vi.mock('@/api/hermes/kanban', () => kanbanApi)
const historyRoom = {
  roomId: '!reg:sv',
  getLiveTimeline: () => ({ getEvents: () => historyEvents }),
}
const sdkClient = {
  on: () => {}, off: () => {},
  sendEvent: async (_roomId: string, type: string, content: Record<string, unknown>) => { sentEvents.push({ type, content }) },
  scrollback: async (room: unknown) => room,
  getRoom: (roomId: string) => roomId === '!reg:sv' ? historyRoom : undefined,
}
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdkClient }, userId: { value: '@bob:sv' } }),
}))
vi.mock('../stores/team-registry', () => ({
  useTeamRegistryStore: () => ({ registryRoomId: { value: '!reg:sv' }, accounts: { value: accounts }, isLeader: { value: false } }),
}))

import { useTaskDispatchStore } from '../stores/task-dispatch'
import { loadDispatchIndex } from '../store/dispatch-kv'

beforeEach(() => {
  setActivePinia(createPinia())
  created.length = 0; sentEvents.length = 0; historyEvents = []; localStorage.clear()
})

const assign = (over: Partial<AssignContent> = {}): AssignContent => ({
  taskId: '11111111-2222-3333-4444-555555555555', title: '做蛋糕', body: '香草味',
  target: { account: '@bob:sv', agentTeam: 'ops' }, issuedBy: '@alice:sv', issuedAt: 1, ...over,
})

describe('receiveAssign', () => {
  it('解析 team 默认 profile → 建卡（前缀+assignee）→ kv 记录 → created 回执', async () => {
    const store = useTaskDispatchStore()
    await store.receiveAssign(assign())
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      title: '[外派-111111] 做蛋糕',
      assignee: 'pb2',
      body: '香草味',
    })
    expect(loadDispatchIndex()['11111111-2222-3333-4444-555555555555']).toMatchObject({ localTaskId: 'kb-1', lastStatus: 'created' })
    const receipt = sentEvents.find(e => e.type === TASK_EVENT_TYPES.receipt)
    expect(receipt?.content).toMatchObject({ taskId: '11111111-2222-3333-4444-555555555555', status: 'created', localTaskId: 'kb-1', reportedBy: '@bob:sv' })
  })
  it('assign.priority 数值字符串 → 建卡透传为 number；缺省/非数值不携带', async () => {
    const store = useTaskDispatchStore()
    await store.receiveAssign(assign({ priority: '3' }))
    expect(created[0]).toMatchObject({ priority: 3 })
    await store.receiveAssign(assign({ taskId: '22222222-2222-3333-4444-555555555555', priority: 'high' }))
    expect(created[1]).toMatchObject({ priority: undefined })
    await store.receiveAssign(assign({ taskId: '33333333-2222-3333-4444-555555555555' }))
    expect(created[2]).toMatchObject({ priority: undefined })
  })
  it('kv 已记录（重复投递）→ 不建卡不回执', async () => {    localStorage.setItem('matrix-teams.dispatchIndex', JSON.stringify({
      '11111111-2222-3333-4444-555555555555': { localTaskId: 'kb-0', lastStatus: 'created', lastSyncedAt: 1 },
    }))
    const store = useTaskDispatchStore()
    await store.receiveAssign(assign())
    expect(created).toHaveLength(0)
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(0)
  })
  it('并发同 taskId 两次 receiveAssign → in-flight 去重，只建一次卡', async () => {
    const store = useTaskDispatchStore()
    // 真实时序：createTask 是异步的，第二次调用落在第一次 await 未完成前——
    // 无 in-flight 去重时 kv 尚未落盘，两次都会走到建卡。
    await Promise.all([store.receiveAssign(assign()), store.receiveAssign(assign())])
    expect(created).toHaveLength(1)
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt
      && e.content.status === 'created')).toHaveLength(1)
  })
  it('createTask await 窗口内 kv 被并发写（轮询回执他人任务）→ 落盘合并新快照不回滚', async () => {
    const otherTaskId = '99999999-2222-3333-4444-555555555555'
    localStorage.setItem('matrix-teams.dispatchIndex', JSON.stringify({
      [otherTaskId]: { localTaskId: 'kb-x', lastStatus: 'created', lastSyncedAt: 1 },
    }))
    // 模拟 pollAndReport 在 createTask 的 await 窗口内把他人任务推进到 running
    kanbanApi.createTask.mockImplementationOnce(async (data: Record<string, unknown>) => {
      const idx = JSON.parse(localStorage.getItem('matrix-teams.dispatchIndex')!)
      idx[otherTaskId].lastStatus = 'running'
      localStorage.setItem('matrix-teams.dispatchIndex', JSON.stringify(idx))
      return { id: 'kb-1', status: 'ready', title: String(data.title) }
    })
    const store = useTaskDispatchStore()
    await store.receiveAssign(assign())
    // 新卡照常落盘；他人任务的 running 不得被旧快照回滚成 created
    expect(loadDispatchIndex()['11111111-2222-3333-4444-555555555555']).toMatchObject({ localTaskId: 'kb-1' })
    expect(loadDispatchIndex()[otherTaskId]).toMatchObject({ lastStatus: 'running' })
  })
  it('目标解析失败 → failed 回执带 reason，不建卡', async () => {
    const store = useTaskDispatchStore()
    await store.receiveAssign(assign({ target: { account: '@nobody:sv' } }))
    expect(created).toHaveLength(0)
    const receipt = sentEvents.find(e => e.type === TASK_EVENT_TYPES.receipt)
    expect(receipt?.content).toMatchObject({ status: 'failed', reason: 'no-such-profile' })
  })
})

// ── Important-2：历史回填（离线/重启迟到消息恢复，spec §10）──
const sdkEv = (type: string, content: unknown) => ({
  getType: () => type, isState: () => false, getContent: () => content,
})

describe('历史回填恢复', () => {
  it('监听挂载前历史里的 assign → 走 receiveAssign 建卡 + kv + created 回执', async () => {
    historyEvents = [sdkEv(TASK_EVENT_TYPES.assign, assign())]
    useTaskDispatchStore() // store 实例化即触发回填（无需组件挂载）
    await vi.waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({ title: '[外派-111111] 做蛋糕', assignee: 'pb2' })
    expect(loadDispatchIndex()['11111111-2222-3333-4444-555555555555']).toMatchObject({ localTaskId: 'kb-1', lastStatus: 'created' })
    const receipt = sentEvents.find(e => e.type === TASK_EVENT_TYPES.receipt)
    expect(receipt?.content).toMatchObject({ status: 'created', localTaskId: 'kb-1' })
  })
  it('scrollback 抛错 → 降级已同步 live timeline，仍回放建卡', async () => {
    historyEvents = [sdkEv(TASK_EVENT_TYPES.assign, assign())]
    const scrollbackSpy = vi.spyOn(sdkClient, 'scrollback').mockRejectedValue(new Error('pagination broken'))
    useTaskDispatchStore()
    await vi.waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({ title: '[外派-111111] 做蛋糕', assignee: 'pb2' })
    expect(loadDispatchIndex()['11111111-2222-3333-4444-555555555555']).toMatchObject({ localTaskId: 'kb-1' })
    scrollbackSpy.mockRestore()
  })
  it('kv 已记录的历史 assign → 回填跳过（幂等，不重复建卡不回执）', async () => {
    localStorage.setItem('matrix-teams.dispatchIndex', JSON.stringify({
      '11111111-2222-3333-4444-555555555555': { localTaskId: 'kb-0', lastStatus: 'created', lastSyncedAt: 1 },
    }))
    historyEvents = [sdkEv(TASK_EVENT_TYPES.assign, assign())]
    useTaskDispatchStore()
    await new Promise(r => setTimeout(r, 20)) // 给回填异步一个跑完的机会
    expect(created).toHaveLength(0)
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(0)
    expect(loadDispatchIndex()['11111111-2222-3333-4444-555555555555']).toMatchObject({ localTaskId: 'kb-0' })
  })
  it('回填后同一 assign 经增量监听重放 → kv 防重，仍只有一张卡', async () => {
    historyEvents = [sdkEv(TASK_EVENT_TYPES.assign, assign())]
    const store = useTaskDispatchStore()
    await vi.waitFor(() => expect(created).toHaveLength(1))
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, assign()), { roomId: '!reg:sv' })
    expect(created).toHaveLength(1)
    expect(store.dispatches).toHaveLength(1) // 视图同样幂等
  })
})
