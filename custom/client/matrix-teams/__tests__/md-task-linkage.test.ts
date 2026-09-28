// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/md-task-linkage.test.ts
// M-D 守门：消息转任务构造/看板态投影/操作→事件（纯函数）、卡片操作 VTU、
// 甘特投影（逾期/依赖连线/无 dueAt 回落）VTU、store 回环（创建→assign、操作→receipt、转派→assign）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import { TASK_EVENT_TYPES, type AssignContent, type ReceiptContent } from '../protocol'
import { buildTaskFromMessage, cardStatus, buildOpReceipt, buildReassign } from '../task-card'
import { projectGantt } from '../gantt'
import TaskCard from '../components/TaskCard.vue'
import GanttPanel from '../../ia2/components/GanttPanel.vue'

// ── 纯函数 ──
describe('task-card 纯函数', () => {
  it('消息转任务：标题=首行截断、正文带原文与来源锚点、字段透传', () => {
    const t = buildTaskFromMessage({
      text: '支付对账日报\n需要接银行流水',
      sourceEventId: '$evt-1',
      target: { account: '@li:sv' }, capability: ['module:payment'], phase: 'P3', dueAt: 99,
      issuedBy: '@pm:sv',
    }, () => 'task-1')
    expect(t).toMatchObject({ taskId: 'task-1', title: '支付对账日报', dueAt: 99, phase: 'P3', capability: ['module:payment'], parentId: undefined })
    expect(t.body).toContain('$evt-1')
    expect(t.body).toContain('需要接银行流水')
  })
  it('cardStatus 六态映射', () => {
    const a = { taskId: 't', title: 'x', target: { account: '@a:sv' }, issuedBy: '@b:sv', issuedAt: 1 } as AssignContent
    const rc = (status: ReceiptContent['status']): ReceiptContent => ({ taskId: 't', status, reportedBy: '@a-agent:sv', reportedAt: 1 })
    expect(cardStatus(a, null)).toBe('pending')
    expect(cardStatus(a, rc('created'))).toBe('assigned')
    expect(cardStatus(a, rc('running'))).toBe('running')
    expect(cardStatus(a, rc('waiting-human'))).toBe('review')
    expect(cardStatus(a, rc('done'))).toBe('done')
    expect(cardStatus(a, rc('failed'))).toBe('blocked')
  })
  it('操作回执：complete→done / block→failed（带 reason）/ reopen→running；转派保留原字段换 target', () => {
    expect(buildOpReceipt('complete', 't1', 'kb-1', '@pm:sv')).toMatchObject({ taskId: 't1', status: 'done' })
    expect(buildOpReceipt('block', 't1', undefined, '@pm:sv')).toMatchObject({ status: 'failed', reason: 'blocked-by-operator' })
    expect(buildOpReceipt('reopen', 't1', undefined, '@pm:sv')).toMatchObject({ status: 'running' })
    const from = buildTaskFromMessage({ text: 't', target: { account: '@li:sv' }, issuedBy: '@pm:sv' }, () => 'task-9')
    const reassigned = buildReassign('task-9', from, { account: '@wang:sv', agentTeam: 'dev' }, '@tl:sv')
    expect(reassigned).toMatchObject({ taskId: 'task-9', target: { account: '@wang:sv', agentTeam: 'dev' }, issuedBy: '@tl:sv' })
    expect(reassigned.issuedAt).toBeGreaterThanOrEqual(from.issuedAt)
  })
})

describe('projectGantt 甘特投影', () => {
  const NOW = 1_000
  const tasks = [
    { taskId: 'a', title: 'A', status: 'running', dueAt: 2_000, dependsOn: ['b'] },
    { taskId: 'b', title: 'B', status: 'done', dueAt: 500 },
    { taskId: 'c', title: 'C', status: 'running', dueAt: 100 }, // 逾期（<NOW 且非 done）
    { taskId: 'd', title: 'D', status: 'todo' },                // 无 dueAt → 回落列表
    { taskId: 'e', title: 'E', status: 'todo', dueAt: 3_000, dependsOn: ['ghost'] }, // 依赖指向不存在 → 忽略
  ]
  it('逾期判定：未完成且 dueAt < now；done 不逾期', () => {
    const p = projectGantt(tasks, NOW)
    const byId = new Map(p.rows.map(r => [r.task.taskId, r]))
    expect(byId.get('c')?.overdue).toBe(true)
    expect(byId.get('b')?.overdue).toBe(false)
    expect(byId.get('a')?.overdue).toBe(false)
  })
  it('依赖连线：两端在轴才画；悬空依赖忽略；自环忽略', () => {
    const p = projectGantt(tasks, NOW)
    expect(p.edges).toEqual([{ from: 'b', to: 'a' }])
  })
  it('无 dueAt 回落列表；时间行按到期升序', () => {
    const p = projectGantt(tasks, NOW)
    expect(p.listOnly.map(t => t.taskId)).toEqual(['d'])
    expect(p.rows.map(r => r.task.taskId)).toEqual(['c', 'b', 'a', 'e'])
  })
})

// ── VTU ──
const assign = (over: Partial<AssignContent> = {}): AssignContent => ({
  taskId: 'task-1', title: '支付对账', target: { account: '@li:sv', agentTeam: 'dev' },
  capability: ['module:payment'], issuedBy: '@pm:sv', issuedAt: 1, ...over,
} as AssignContent)
const receipt = (status: ReceiptContent['status']): ReceiptContent =>
  ({ taskId: 'task-1', status, reportedBy: '@li-agent:sv', reportedAt: 2 })

describe('TaskCard VTU', () => {
  function card(receiptStatus: ReceiptContent['status'] | null, canOperate = true) {
    return mount(TaskCard, {
      props: { assign: assign(), receipt: receiptStatus ? receipt(receiptStatus) : null, canOperate } as never,
      global: { plugins: [createPinia()] },
    })
  }
  it('无回执 → pending；操作可点', () => {
    const w = card(null)
    expect(w.find('[data-testid="task-card-status-task-1"]').text()).toBe('ia2.taskCard.status.pending')
    expect((w.find('[data-testid="task-op-complete-task-1"]').element as HTMLButtonElement).disabled).toBe(false)
  })
  it('done 态：完成钮禁用、重开可用；blocked 态：阻塞钮禁用', () => {
    const w = card('done')
    expect((w.find('[data-testid="task-op-complete-task-1"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((w.find('[data-testid="task-op-reopen-task-1"]').element as HTMLButtonElement).disabled).toBe(false)
    const wb = card('failed')
    expect((wb.find('[data-testid="task-op-block-task-1"]').element as HTMLButtonElement).disabled).toBe(true)
  })
  it('操作 emit：complete/reopen；负责人与 Agent 徽章渲染', async () => {
    const w = card('done')
    await w.find('[data-testid="task-op-reopen-task-1"]').trigger('click')
    expect(w.emitted('op')).toEqual([['reopen']])
    expect(w.find('[data-testid="task-card-assignee-task-1"]').text()).toContain('li')
    expect(w.find('[data-testid="task-card-agent-task-1"]').text()).toBe('module:payment')
  })
  it('canOperate=false → 只读无操作钮', () => {
    const w = card(null, false)
    expect(w.find('[data-testid="task-op-complete-task-1"]').exists()).toBe(false)
  })
})

describe('GanttPanel VTU', () => {
  const NOW = 1_000
  const tasks = [
    { taskId: 'a', title: 'A', status: 'running', dueAt: 2_000, dependsOn: ['b'] },
    { taskId: 'b', title: 'B', status: 'done', dueAt: 500 },
    { taskId: 'c', title: 'C', status: 'running', dueAt: 100 },
    { taskId: 'd', title: 'D', status: 'todo' },
  ]
  it('时间轴行/逾期着色/依赖连线/无 dueAt 回落列表齐备', () => {
    const w = mount(GanttPanel, { props: { tasks, now: NOW } as never, global: { plugins: [createPinia()] } })
    expect(w.findAll('[data-testid^="gantt-row-"]')).toHaveLength(3)
    expect(w.find('[data-testid="gantt-bar-c"]').classes()).toContain('gtp__bar--over')
    expect(w.find('[data-testid="gantt-bar-b"]').classes()).not.toContain('gtp__bar--over')
    expect(w.find('[data-testid="gantt-edge-b-a"]').exists()).toBe(true)
    expect(w.find('[data-testid="gantt-list-d"]').exists()).toBe(true)
  })
  it('无时间任务 → 空态', () => {
    const w = mount(GanttPanel, { props: { tasks: [{ taskId: 'd', title: 'D', status: 'todo' }], now: NOW } as never, global: { plugins: [createPinia()] } })
    expect(w.find('[data-testid="gantt-chart"]').exists()).toBe(false)
    expect(w.text()).toContain('ia2.gantt.noTimed')
  })
})

// ── store 回环（M-D 验收门 1 的事件链等价物；CDP 动线归发布轮）──
const sentEvents: Array<{ roomId?: string; type: string; content: Record<string, unknown> }> = []
const sdkClient = {
  on: () => {}, off: () => {},
  sendEvent: async (roomId: string, type: string, content: Record<string, unknown>) => { sentEvents.push({ roomId, type, content }) },
}
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdkClient }, userId: { value: '@pm:sv' } }),
}))
vi.mock('../stores/team-registry', () => ({
  useTeamRegistryStore: () => ({ registryRoomId: { value: '!reg:sv' }, accounts: { value: [] }, isLeader: { value: true } }),
}))

import { useTaskLinkageStore } from '../stores/task-linkage'

const sdkEv = (type: string, content: unknown) => ({
  getType: () => type, isState: () => false, getContent: () => content,
})

beforeEach(() => {
  setActivePinia(createPinia())
  sentEvents.length = 0
})

describe('task-linkage store 回环', () => {
  it('消息转任务 → assign 事件；回执到 → 卡片投影态变化', async () => {
    const store = useTaskLinkageStore()
    const created = await store.createTaskFromMessage({ text: '修登录超时\n复现：弱网', target: { account: '@li:sv' }, capability: ['coding'] })
    expect(created.ok).toBe(true)
    const assignEv = sentEvents.find(e => e.type === TASK_EVENT_TYPES.assign)
    expect(assignEv?.content).toMatchObject({ title: '修登录超时', target: { account: '@li:sv' }, capability: ['coding'], issuedBy: '@pm:sv' })
    // 事件回流 → 卡片 pending
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, assignEv!.content), { roomId: '!reg:sv' })
    expect(store.cards).toHaveLength(1)
    expect(store.cards[0].receipt).toBeNull()
    // 成员回执 created → assigned；再 running → running
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, { taskId: created.taskId, status: 'created', reportedBy: '@li-agent:sv', reportedAt: 5 }), { roomId: '!reg:sv' })
    expect(cardStatus(store.cards[0].assign, store.cards[0].receipt)).toBe('assigned')
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.receipt, { taskId: created.taskId, status: 'running', reportedBy: '@li-agent:sv', reportedAt: 6 }), { roomId: '!reg:sv' })
    expect(cardStatus(store.cards[0].assign, store.cards[0].receipt)).toBe('running')
  })
  it('卡片操作：完成 → done 回执事件；转派 → 新 assign 事件（同 taskId 新 target）', async () => {
    const store = useTaskLinkageStore()
    const created = await store.createTaskFromMessage({ text: '任务X', target: { account: '@li:sv' } })
    await store.handleTimelineEvent(sdkEv(TASK_EVENT_TYPES.assign, sentEvents[0].content), { roomId: '!reg:sv' })
    sentEvents.length = 0
    expect(await store.applyCardOp('complete', created.taskId!)).toBe(true)
    expect(sentEvents[0]).toMatchObject({ type: TASK_EVENT_TYPES.receipt })
    expect(sentEvents[0].content).toMatchObject({ taskId: created.taskId, status: 'done', reportedBy: '@pm:sv' })
    expect(await store.reassignTask(created.taskId!, { account: '@wang:sv', agentTeam: 'dev' })).toBe(true)
    const reassignEv = sentEvents.find(e => e.type === TASK_EVENT_TYPES.assign)
    expect(reassignEv?.content).toMatchObject({ taskId: created.taskId, target: { account: '@wang:sv', agentTeam: 'dev' }, issuedBy: '@pm:sv' })
  })
  it('未知 taskId 转派 → false 不发事件（越权/无效输入守卫；账号级权限由 Matrix PL=50 硬约束）', async () => {
    const store = useTaskLinkageStore()
    expect(await store.reassignTask('ghost', { account: '@x:sv' })).toBe(false)
    expect(sentEvents).toHaveLength(0)
  })
})
