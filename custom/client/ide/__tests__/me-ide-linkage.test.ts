// @vitest-environment jsdom
// overlay/custom/client/ide/__tests__/me-ide-linkage.test.ts
// M-E 守门：任务上下文绑定、diff 确认=R3 门事件（evidence=artifact+本人 signoff）、
// 提交回执=done receipt、上下文条 VTU（渲染/操作/禁用）。既有 /ide 面零改动（回归由全量兜底）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import {
  TASK_EVENT_TYPES,
  type AssignContent,
} from '../../matrix-teams/protocol'
import { DELIVERY_EVENT_TYPES } from '../../matrix-teams/delivery-protocol'
import { useIdeLinkageStore } from '../../matrix-teams/stores/ide-linkage'

// ── store 端到端事件链 ──
const sentEvents: Array<{ roomId?: string; type: string; content: Record<string, unknown> }> = []
const sdkClient = {
  on: () => {}, off: () => {},
  sendEvent: async (roomId: string, type: string, content: Record<string, unknown>) => { sentEvents.push({ roomId, type, content }) },
}
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdkClient }, userId: { value: '@dev:sv' } }),
}))
vi.mock('../../matrix-teams/stores/team-registry', () => ({
  useTeamRegistryStore: () => ({ registryRoomId: { value: '!reg:sv' }, accounts: { value: [] }, isLeader: { value: false } }),
}))

const sdkEv = (type: string, content: unknown, roomId = '!reg:sv') => ({
  getType: () => type, isState: () => false, getContent: () => content,
})

beforeEach(() => {
  setActivePinia(createPinia())
  sentEvents.length = 0
})

const taskAssign = (): AssignContent => ({
  taskId: 'task-e1', title: '修登录超时', target: { account: '@dev:sv' },
  issuedBy: '@pm:sv', issuedAt: 1, capability: ['coding'],
} as AssignContent)

describe('ide-linkage store（M-E 端到端事件链）', () => {
  it('绑定任务（docRefs/chatAnchor/caseId/ACP 会话）→ cardOf 投影任务卡', async () => {
    const store = useIdeLinkageStore()
    store.bindTask('task-e1', { docRefs: ['docs/delivery/c-1/design.md'], chatAnchor: '$msg-9', caseId: 'c-1', roomId: '!case:sv' })
    store.bindSession('task-e1', 'acp-session-7')
    expect(store.bindingOf('task-e1')).toMatchObject({ taskId: 'task-e1', acpSessionId: 'acp-session-7', caseId: 'c-1', roomId: '!case:sv', docRefs: ['docs/delivery/c-1/design.md'], chatAnchor: '$msg-9' })
    // assign 事件回流 → cardOf 命中
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, taskAssign()), { roomId: '!reg:sv' })
    const card = store.cardOf('task-e1')
    expect(card?.assign.title).toBe('修登录超时')
    expect(card?.receipt).toBeNull()
  })
  it('confirmDiff → 案例房发 R3 gate 事件（evidence=artifact 指针 + 本人 signoff）', async () => {
    const store = useIdeLinkageStore()
    store.bindTask('task-e1', { caseId: 'c-1', roomId: '!case:sv' })
    const res = await store.confirmDiff('task-e1', 'git:main#abc123:diffs/login.patch')
    expect(res).toEqual({ ok: true })
    expect(sentEvents[0]).toMatchObject({ roomId: '!case:sv', type: DELIVERY_EVENT_TYPES.gate })
    expect(sentEvents[0].content).toMatchObject({
      caseId: 'c-1', gate: 'R3', verdict: 'pass',
      evidence: { kind: 'artifact', summary: 'git:main#abc123:diffs/login.patch' },
      signoff: { decidedBy: '@dev:sv', verdict: 'pass' },
      decidedBy: '@dev:sv',
    })
  })
  it('confirmDiff 无绑定 → 回落注册房、caseId 用 task: 前缀占位', async () => {
    const store = useIdeLinkageStore()
    const res = await store.confirmDiff('task-raw', 'git:ref#1:x')
    expect(res).toEqual({ ok: true })
    expect(sentEvents[0]).toMatchObject({ roomId: '!reg:sv' })
    expect(sentEvents[0].content).toMatchObject({ caseId: 'task:task-raw', gate: 'R3' })
  })
  it('markSubmitted → done 回执事件（携带 localTaskId 透传）+ 回写看板投影', async () => {
    const store = useIdeLinkageStore()
    // 先让 assign 进投影（cardOf 需任务存在，回执才能挂上）
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, taskAssign()), { roomId: '!reg:sv' })
    expect(await store.markSubmitted('task-e1', 'kb-9')).toBe(true)
    expect(sentEvents[0]).toMatchObject({ type: TASK_EVENT_TYPES.receipt })
    expect(sentEvents[0].content).toMatchObject({ taskId: 'task-e1', status: 'done', localTaskId: 'kb-9', reportedBy: '@dev:sv' })
    // 回执回流 → cardOf 的 receipt 命中（回写看板投影）
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, sentEvents[0].content), { roomId: '!reg:sv' })
    expect(store.cardOf('task-e1')?.receipt).toMatchObject({ status: 'done' })
  })
})

// ── 上下文条 VTU ──
vi.mock('../store/ide', async () => {
  const { ref, reactive } = await import('vue')
  const state = reactive({ activeTaskId: ref<string | null>(null) })
  // 返回 reactive 本体（追加方法）：展开复制会丢响应性（快照 null 的坑）。
  return { useIdeStore: () => Object.assign(state, { setActiveTask: (id: string | null) => { state.activeTaskId = id } }) }
})
import IdeTaskContextBar from '../components/IdeTaskContextBar.vue'

describe('IdeTaskContextBar VTU', () => {
  function bar() {
    // 不挂 pinia 插件：组件 useStore 走 setActivePinia 的当前实例（与测试侧同源）。
    return mount(IdeTaskContextBar, { global: { plugins: [] } })
  }
  it('无 activeTask → 整条隐藏', () => {
    const w = bar()
    expect(w.find('[data-testid="ide-task-context-bar"]').exists()).toBe(false)
  })
  it('激活任务 + 绑定 → 标题/状态/文档数/聊天锚点/ACP 徽章齐渲染', async () => {
    setActivePinia(createPinia())
    const fresh = useIdeLinkageStore()
    fresh.bindTask('task-e1', { docRefs: ['docs/delivery/c-1/design.md', 'docs/delivery/c-1/prd.md'], chatAnchor: '$msg-9', acpSessionId: 'acp-7' })
    await fresh.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, taskAssign()), { roomId: '!reg:sv' })
    const ideStore = (await import('../store/ide')).useIdeStore()
    ideStore.setActiveTask('task-e1')
    const w = bar()
    expect(w.find('[data-testid="ide-task-context-title"]').text()).toBe('修登录超时')
    expect(w.find('[data-testid="ide-task-context-status"]').text()).toBe('ia2.taskCard.status.pending')
    expect(w.find('[data-testid="ide-task-context-docs"]').text()).toContain('2')
    expect(w.find('[data-testid="ide-task-context-anchor"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-task-context-acp"]').exists()).toBe(true)
    // diff 确认：空指针禁用；填后可点 → R3 事件发出 → ok 徽章
    expect((w.find('[data-testid="ide-task-diff-confirm"]').element as HTMLButtonElement).disabled).toBe(true)
    await w.find('[data-testid="ide-task-diff-input"]').setValue('git:main#1:d.patch')
    await w.find('[data-testid="ide-task-diff-confirm"]').trigger('click')
    await vi.waitFor(() => expect(w.find('[data-testid="ide-task-r3-ok"]').exists()).toBe(true))
    expect(sentEvents.at(-1)).toMatchObject({ type: DELIVERY_EVENT_TYPES.gate })
    // 提交：done 回执
    await w.find('[data-testid="ide-task-submit"]').trigger('click')
    await vi.waitFor(() => expect(sentEvents.at(-1)).toMatchObject({ type: TASK_EVENT_TYPES.receipt }))
    expect(sentEvents.at(-1)?.content).toMatchObject({ status: 'done' })
  })
})
