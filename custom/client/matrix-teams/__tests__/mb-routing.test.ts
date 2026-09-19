// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/mb-routing.test.ts
// M-B 路由与拆分守门：能力路由决策表（纯函数）+ 任务树 fan-out/父投影 + store 级落地
//（capability 命中建卡 / 无命中 failed / 满 maxParallel 排队与槽位释放重试 / agent.profile 汇入）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  TASK_EVENT_TYPES, AGENT_PROFILE_EVENT_TYPE,
  type AssignContent, type ReceiptContent, type AgentDescriptor,
} from '../protocol'
import { selectAgent, isLoadOccupying, DEFAULT_MAX_PARALLEL } from '../agent-router'
import { buildSubtaskAssigns, projectParentStatus } from '../task-tree'
import { mapKanbanStatusToReceipt } from '../adapters/dispatch-target'
import type { TeamAccountView } from '../adapters/accounts'

// ── 纯函数：selectAgent 决策表（M-B 验收门 1）──
const agent = (over: Partial<AgentDescriptor> = {}): AgentDescriptor => ({
  agentId: 'a0', agentType: 'coder', capabilities: ['coding'], ...over,
})

describe('selectAgent 决策表', () => {
  it('全覆盖标签 → assigned，取在途最少者', () => {
    const busy = agent({ agentId: 'busy', capabilities: ['coding'] })
    const idle = agent({ agentId: 'idle', capabilities: ['coding'] })
    const d = selectAgent({ capability: ['coding'] }, [busy, idle], [
      { agentId: 'busy', running: 2 }, { agentId: 'idle', running: 0 },
    ])
    expect(d).toMatchObject({ kind: 'assigned', agent: { agentId: 'idle' } })
  })
  it('多标签须全覆盖：部分覆盖 → no-match', () => {
    const onlyCode = agent({ capabilities: ['coding'] })
    expect(selectAgent({ capability: ['coding', 'test'] }, [onlyCode], [])).toEqual({ kind: 'no-match' })
  })
  it('同载并列按 agentId 字典序（确定性）', () => {
    const b = agent({ agentId: 'b' }), a = agent({ agentId: 'a' })
    const tie = selectAgent({ capability: ['coding'] }, [b, a], [])
    expect(tie).toMatchObject({ kind: 'assigned', agent: { agentId: 'a' } })
  })
  it('满 maxParallel → queued；声明 maxParallel=2 时 running=1 仍可接', () => {
    const solo = agent({ agentId: 'solo' }) // maxParallel 缺省
    expect(selectAgent({ capability: ['coding'] }, [solo], [{ agentId: 'solo', running: DEFAULT_MAX_PARALLEL }])).toEqual({ kind: 'queued', reason: 'max-parallel' })
    const dual = agent({ agentId: 'dual', maxParallel: 2 })
    expect(selectAgent({ capability: ['coding'] }, [dual], [{ agentId: 'dual', running: 1 }])).toMatchObject({ kind: 'assigned', agent: { agentId: 'dual' } })
  })
  it('capability 为空 → no-match（无标签 assign 不走能力路由）', () => {
    expect(selectAgent({}, [agent()], [])).toEqual({ kind: 'no-match' })
  })
  it('isLoadOccupying：created/running/waiting-human 占额，done/failed 释放', () => {
    expect(isLoadOccupying('created')).toBe(true)
    expect(isLoadOccupying('running')).toBe(true)
    expect(isLoadOccupying('waiting-human')).toBe(true)
    expect(isLoadOccupying('done')).toBe(false)
    expect(isLoadOccupying('failed')).toBe(false)
  })
})

// ── 纯函数：任务树（M-B 验收门 2 前半）──
describe('buildSubtaskAssigns / projectParentStatus', () => {
  const subs = [
    { title: '账单模块', capability: ['module:payment'], target: { account: '@li:sv' } },
    { title: '报表', target: { account: '@wang:sv' }, phase: 'P4' },
  ]
  it('子任务带 parentId、缺省继承 phase/dueAt、taskId 唯一（注入 idGen）', () => {
    let n = 0
    const out = buildSubtaskAssigns({ taskId: 'case-1', phase: 'P3', dueAt: 99 }, subs, '@pm:sv', () => `t-${n++}`)
    expect(out).toHaveLength(2)
    expect(out.map(a => a.taskId)).toEqual(['t-0', 't-1'])
    expect(out.every(a => a.parentId === 'case-1')).toBe(true)
    expect(out[0]).toMatchObject({ phase: 'P3', dueAt: 99, capability: ['module:payment'] })
    expect(out[1]).toMatchObject({ phase: 'P4', capability: undefined, issuedBy: '@pm:sv' })
  })
  const rc = (status: ReceiptContent['status'], taskId = 'x'): ReceiptContent =>
    ({ taskId, status, reportedBy: '@bob-agent:sv', reportedAt: 1 })
  it('父投影四态：无回执 waiting / 任一 failed blocked / 全 done review-ready / 其余 in-progress', () => {
    expect(projectParentStatus([])).toBe('waiting')
    expect(projectParentStatus([rc('done', 'a'), rc('failed', 'b')])).toBe('blocked')
    expect(projectParentStatus([rc('done', 'a'), rc('done', 'b')])).toBe('review-ready')
    expect(projectParentStatus([rc('done', 'a'), rc('running', 'b')])).toBe('in-progress')
  })
  it('mapKanbanStatusToReceipt：review → waiting-human（M-B 执行轴）', () => {
    expect(mapKanbanStatusToReceipt('review')).toBe('waiting-human')
  })
})

// ── store 级：能力路由落地（复用 dispatch-receive 的 mock 形态）──
const accounts: TeamAccountView[] = [
  { userId: '@bob:sv', displayName: 'bob', isLeader: false, declared: true, agentTeams: [
    { slug: 'ops', name: 'Ops', profiles: ['pb1', 'pb2'], defaultProfile: 'pb2' },
  ] },
]
const created: Array<Record<string, unknown>> = []
const sentEvents: Array<{ type: string; content: Record<string, unknown> }> = []
const kanbanApi = vi.hoisted(() => ({
  createTask: vi.fn(async (data: Record<string, unknown>) => {
    created.push(data)
    return { id: `kb-${created.length}`, status: 'ready', title: String(data.title) }
  }),
  getTask: vi.fn(async (id: string) => ({ id, status: 'running' })),
}))
vi.mock('@/api/hermes/kanban', () => kanbanApi)
const historyRoom = {
  roomId: '!reg:sv',
  getLiveTimeline: () => ({ getEvents: () => [] }),
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
import { loadDispatchIndex, saveDispatchIndex } from '../store/dispatch-kv'

beforeEach(() => {
  setActivePinia(createPinia())
  created.length = 0; sentEvents.length = 0; localStorage.clear()
})

const sdkEv = (type: string, content: unknown) => ({
  getType: () => type, isState: () => false, getContent: () => content,
})
const assign = (over: Partial<AssignContent> = {}): AssignContent => ({
  taskId: '11111111-2222-3333-4444-555555555555', title: '拆解子任务',
  target: { account: '@bob:sv', agentTeam: 'ops' }, issuedBy: '@alice:sv', issuedAt: 1, ...over,
})
const profileEv = (agents: AgentDescriptor[]) => sdkEv(AGENT_PROFILE_EVENT_TYPE, {
  schemaVersion: 2, agents, updatedBy: '@bob-agent:sv', updatedAt: 1,
})

describe('能力路由落地（M-B）', () => {
  it('agent.profile 经 timeline 汇入 localAgents → capability 命中建卡 + kv 记 routedAgentId + created 回执', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(profileEv([agent({ agentId: 'coder', capabilities: ['coding'] })]), { roomId: '!reg:sv' })
    expect(store.localAgents).toHaveLength(1)
    await store.receiveAssign(assign({ capability: ['coding'] }))
    expect(created).toHaveLength(1)
    expect(loadDispatchIndex()['11111111-2222-3333-4444-555555555555']).toMatchObject({ localTaskId: 'kb-1', routedAgentId: 'coder' })
    expect(sentEvents.find(e => e.type === TASK_EVENT_TYPES.receipt)?.content).toMatchObject({ status: 'created', localTaskId: 'kb-1' })
  })
  it('capability 无本机覆盖者 → failed 回执 no-capability-match，不建卡', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(profileEv([agent({ capabilities: ['coding'] })]), { roomId: '!reg:sv' })
    await store.receiveAssign(assign({ capability: ['module:payment'] }))
    expect(created).toHaveLength(0)
    expect(sentEvents.find(e => e.type === TASK_EVENT_TYPES.receipt)?.content).toMatchObject({ status: 'failed', reason: 'no-capability-match' })
  })
  it('满 maxParallel → 入队不建卡不回执；槽位释放后 pollAndReport 排空建卡', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(profileEv([agent({ agentId: 'coder', capabilities: ['coding'] })]), { roomId: '!reg:sv' })
    // 占位：他人在途一张（coder running=1，缺省 maxParallel=1 → 满）
    saveDispatchIndex({ 'old-task': { localTaskId: 'kb-0', lastStatus: 'running', lastSyncedAt: 1, routedAgentId: 'coder' } })
    await store.receiveAssign(assign({ capability: ['coding'] }))
    expect(created).toHaveLength(0)
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(0)
    // 槽位释放（他人完成）→ 轮询排空 → 建卡 + created 回执
    saveDispatchIndex({ 'old-task': { localTaskId: 'kb-0', lastStatus: 'done', lastSyncedAt: 2, routedAgentId: 'coder' } })
    await store.pollAndReport()
    expect(created).toHaveLength(1)
    expect(sentEvents.find(e => e.type === TASK_EVENT_TYPES.receipt)?.content).toMatchObject({ status: 'created' })
    expect(loadDispatchIndex()['11111111-2222-3333-4444-555555555555']).toMatchObject({ routedAgentId: 'coder' })
  })
  it('sendSubtasks → N 条 assign 事件各带 parentId 且继承 phase', async () => {
    const store = useTaskDispatchStore()
    const sent = await store.sendSubtasks(
      { taskId: 'case-9', phase: 'P3', dueAt: 77 },
      [
        { title: '子1', capability: ['coding'], target: { account: '@li:sv' } },
        { title: '子2', capability: ['test'], target: { account: '@zhao:sv' } },
        { title: '子3', target: { account: '@wang:sv' } },
      ],
    )
    expect(sent).toBe(3)
    const assigns = sentEvents.filter(e => e.type === TASK_EVENT_TYPES.assign)
    expect(assigns).toHaveLength(3)
    expect(assigns.every(a => a.content.parentId === 'case-9')).toBe(true)
    expect(assigns.every(a => a.content.phase === 'P3' && a.content.dueAt === 77)).toBe(true)
    expect(new Set(assigns.map(a => String(a.content.taskId))).size).toBe(3)
    expect(assigns.map(a => (a.content as { capability?: string[] }).capability)).toEqual([['coding'], ['test'], undefined])
  })
})
