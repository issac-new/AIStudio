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
const kanbanApi = vi.hoisted(() => ({
  createTask: vi.fn(async (data: Record<string, unknown>) => {
    created.push(data)
    return { id: 'kb-1', status: 'ready', title: String(data.title) }
  }),
}))
vi.mock('@/api/hermes/kanban', () => kanbanApi)
const sdkClient = {
  on: () => {}, off: () => {},
  sendEvent: async (_roomId: string, type: string, content: Record<string, unknown>) => { sentEvents.push({ type, content }) },
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
  created.length = 0; sentEvents.length = 0; localStorage.clear()
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
  it('kv 已记录（重复投递）→ 不建卡不回执', async () => {
    localStorage.setItem('matrix-teams.dispatchIndex', JSON.stringify({
      '11111111-2222-3333-4444-555555555555': { localTaskId: 'kb-0', lastStatus: 'created', lastSyncedAt: 1 },
    }))
    const store = useTaskDispatchStore()
    await store.receiveAssign(assign())
    expect(created).toHaveLength(0)
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(0)
  })
  it('目标解析失败 → failed 回执带 reason，不建卡', async () => {
    const store = useTaskDispatchStore()
    await store.receiveAssign(assign({ target: { account: '@nobody:sv' } }))
    expect(created).toHaveLength(0)
    const receipt = sentEvents.find(e => e.type === TASK_EVENT_TYPES.receipt)
    expect(receipt?.content).toMatchObject({ status: 'failed', reason: 'no-such-profile' })
  })
})
