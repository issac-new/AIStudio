// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/dispatch-list.test.ts
// 轮询回执守门 + 外派列表渲染 + 评审遗留：receipt 先到暂存补配、priority 透传。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { TASK_EVENT_TYPES, type AssignContent, type ReceiptContent } from '../protocol'

// ── 轮询回执 ──
const sentEvents: Array<{ type: string; content: Record<string, unknown> }> = []
let taskRow: { id: string; status: string } | null = null
const kanbanApi = vi.hoisted(() => ({
  createTask: vi.fn(async () => ({ id: 'kb-9', status: 'ready' })),
  getTask: vi.fn(async () => taskRow),
}))
vi.mock('@/api/hermes/kanban', () => kanbanApi)
const sdkClient = {
  on: () => {}, off: () => {},
  sendEvent: async (_r: string, type: string, content: Record<string, unknown>) => { sentEvents.push({ type, content }) },
}
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdkClient }, userId: { value: '@bob:sv' } }),
}))

// mock store 必须是真 ref + reactive 包装（P1 坑）：裸 { value } 对象无响应性；
// reactive 属性访问/赋值自动解包 ref，组件读 registry.isLeader/registry.accounts
// 拿到解包值，DispatchList「切 isLeader 后表单显隐」依赖其触发重渲染。
const registryState = vi.hoisted(() => ({ state: null as unknown as Record<string, unknown> }))
vi.mock('../stores/team-registry', async () => {
  const { reactive, ref } = await import('vue')
  registryState.state = reactive({
    registryRoomId: ref('!reg:sv'), leaders: ref([] as string[]), isLeader: ref(false),
    undeclared: ref([] as string[]), duties: ref({}), ready: ref(true), lastError: ref(null),
    accounts: ref([
      { userId: '@bob:sv', displayName: 'bob', isLeader: false, declared: true,
        agentTeams: [{ slug: 'ops', name: 'Ops', profiles: ['pb'], defaultProfile: 'pb' }] },
    ]),
    ensureListening: () => {}, detectRegistry: async () => {}, registryCandidateRooms: () => [],
    setRegistryRoom: async () => {}, createRegistryRoom: async () => null,
    writeSelfAccount: async () => false, writeLeaders: async () => false,
    writeDuty: async () => false, clearDuty: async () => false,
    inviteMember: async () => false, attachRoom: () => {}, rebuild: async () => {},
  })
  return { useTeamRegistryStore: () => registryState.state }
})

import { useTaskDispatchStore } from '../stores/task-dispatch'

beforeEach(() => {
  setActivePinia(createPinia())
  sentEvents.length = 0
  localStorage.clear()
  registryState.state.isLeader = false
})

describe('pollAndReport', () => {
  it('状态变化才回执；无变化不重复发', async () => {
    localStorage.setItem('matrix-teams.dispatchIndex', JSON.stringify({
      t1: { localTaskId: 'kb-1', lastStatus: 'created', lastSyncedAt: 1 },
    }))
    const store = useTaskDispatchStore()
    taskRow = { id: 'kb-1', status: 'running' }
    await store.pollAndReport()
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(1)
    expect(sentEvents[0].content).toMatchObject({ taskId: 't1', status: 'running', localTaskId: 'kb-1' })
    await store.pollAndReport() // 同状态重跑 → 不再发
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(1)
    taskRow = { id: 'kb-1', status: 'done' }
    await store.pollAndReport()
    const rs = sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)
    expect(rs).toHaveLength(2)
    expect(rs[1].content).toMatchObject({ status: 'done' })
  })
  it('getTask 抛错 → 静默（不崩、不发），下轮重试', async () => {
    localStorage.setItem('matrix-teams.dispatchIndex', JSON.stringify({
      t1: { localTaskId: 'kb-1', lastStatus: 'created', lastSyncedAt: 1 },
    }))
    kanbanApi.getTask.mockRejectedValueOnce(new Error('net'))
    const store = useTaskDispatchStore()
    await expect(store.pollAndReport()).resolves.toBeUndefined()
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(0)
    taskRow = { id: 'kb-1', status: 'running' } // 下轮恢复 → 正常上报
    await store.pollAndReport()
    expect(sentEvents.filter(e => e.type === TASK_EVENT_TYPES.receipt)).toHaveLength(1)
  })
})

// ── 评审遗留：receipt 先 assign 后（暂存补配不丢）──
describe('孤儿回执暂存', () => {
  const receiptOf = (over: Partial<ReceiptContent>): ReceiptContent => ({
    taskId: '11111111-2222-3333-4444-555555555555', status: 'done',
    reportedBy: '@bob:sv', reportedAt: 99, ...over,
  })
  const sdkEv = (type: string, content: unknown) => ({
    getType: () => type, isState: () => false, getContent: () => content,
  })
  const roomStub = { roomId: '!reg:sv' }
  it('receipt 先于 assign 到达：暂存，assign 到达后视图合并该回执', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, receiptOf({})), roomStub)
    expect(store.dispatches).toHaveLength(0) // 暂存不进视图
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, {
      taskId: '11111111-2222-3333-4444-555555555555', title: '做蛋糕',
      target: { account: '@bob:sv' }, issuedBy: '@alice:sv', issuedAt: 1,
    } satisfies AssignContent), roomStub)
    expect(store.dispatches).toHaveLength(1)
    expect(store.dispatches[0].receipt?.status).toBe('done')
    expect(store.dispatches[0].receipt?.reportedAt).toBe(99)
  })
})

// ── DispatchList UI ──
const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false,
  messages: { en: { teams: { dispatch: {
    title: 'Dispatched', new: 'Dispatch', titleField: 'Title', body: 'Desc', target: 'Target',
    profile: 'Profile', send: 'Send', empty: 'Empty', issuedBy: 'By',
    status: { created: 'Created', running: 'Running', done: 'Done', failed: 'Failed' },
  } } } } })

import DispatchList from '../components/DispatchList.vue'

const assignFixture: AssignContent = {
  taskId: '11111111-2222-3333-4444-555555555555', title: '做蛋糕',
  target: { account: '@bob:sv' }, issuedBy: '@alice:sv', issuedAt: 1,
}

describe('DispatchList', () => {
  it('渲染外派条目与状态徽标；leader 才有表单', async () => {
    const store = useTaskDispatchStore()
    await store.handleTimelineEvent(
      { getType: () => TASK_EVENT_TYPES.assign, isState: () => false, getContent: () => assignFixture },
      { roomId: '!reg:sv' })
    registryState.state.isLeader = false
    const w = mount(DispatchList, { global: { plugins: [i18n] } })
    expect(w.find('[data-testid="dispatch-item-111111"]').exists()).toBe(true)
    // test setup 全局 mock useI18n（t 返回键名），断言键名即验证状态映射兜底 'created'。
    expect(w.find('[data-testid="dispatch-status"]').text()).toBe('teams.dispatch.status.created')
    expect(w.find('[data-testid="dispatch-empty"]').exists()).toBe(false)
    expect(w.find('[data-testid="dispatch-send"]').exists()).toBe(false)
    registryState.state.isLeader = true
    await flushPromises()
    expect(w.find('[data-testid="dispatch-send"]').exists()).toBe(true)
  })
  it('leader 填表发送 → sendAssignment 带表单值', async () => {
    const store = useTaskDispatchStore()
    const spy = vi.spyOn(store, 'sendAssignment').mockResolvedValue(true)
    registryState.state.isLeader = true
    const w = mount(DispatchList, { global: { plugins: [i18n] } })
    await w.find('[data-testid="dispatch-title-input"]').setValue('写周报')
    await w.find('[data-testid="dispatch-target-select"]').setValue('@bob:sv')
    await w.find('[data-testid="dispatch-profile-select"]').setValue('pb')
    await w.find('[data-testid="dispatch-send"]').trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      title: '写周报', target: { account: '@bob:sv', profile: 'pb' },
    }))
  })
  it('非 leader 空列表显示 empty 文案', () => {
    const w = mount(DispatchList, { global: { plugins: [i18n] } })
    expect(w.find('[data-testid="dispatch-empty"]').text()).toBe('teams.dispatch.empty')
  })
})
