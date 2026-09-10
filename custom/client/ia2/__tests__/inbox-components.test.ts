// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/inbox-components.test.ts
// P3 Task 5 — 介入中心组件 jsdom 冒烟：TriageQueue 两视图 + 内联审批 + 分诊流转，
// AlarmList，InboxView 五源装配 + 源筛选 + 深链 + 分诊 kv + 自动归档 + 日切重置。
// i18n 走全局 setup 的 key 直返 mock；ApprovalPanel 桩化（本体在 runcenter 自测），
// runs store 用真身（REST/loop-rest 桩），cockpit store 桩化（重图隔离）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// ── REST/loop-rest 桩（runs store 真身）──
const { runRest, loopRest } = vi.hoisted(() => ({
  runRest: {
    listRuns: vi.fn(async () => [] as Array<{ runId: string; graphId: string; status: string; updatedAt: string | null }>),
    replay: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
    getRun: vi.fn(async () => { throw new Error('not used') }),
    resumeRun: vi.fn(async () => ({ runId: 'x', instance: {} })),
    forkRun: vi.fn(async () => ({ runId: 'f', forkedFrom: 'x', superStep: 0 })),
    startRun: vi.fn(async () => ({ runId: 'f', instance: {} })),
    exportRun: vi.fn(async () => ({ run: {}, spec: null, events: [] })),
    getSpec: vi.fn(async () => null),
  },
  loopRest: {
    listLoops: vi.fn(async () => [] as Array<{ id: string }>),
    getEvents: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
  },
}))

vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest,
  connectGraph: vi.fn(() => ({ connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })),
  disconnectGraph: vi.fn(),
}))
vi.mock('@/custom/loop/api/loop-rest', () => ({ loopRest }))

// ── ApprovalPanel 桩（内联审批接线单独断言；审批本体在 runcenter 测试域）──
const approvalPanel = vi.hoisted(() => ({ count: 0 }))
vi.mock('@/custom/loop/runcenter/components/ApprovalPanel.vue', () => ({
  default: { props: ['run'], setup: () => { approvalPanel.count += 1 }, template: '<div class="approval-stub" />' },
}))

// ── cockpit store 桩 ──
const cockpitStubs = vi.hoisted(() => {
  const state = {
    tasks: [] as Array<{ id: string; title: string; status: string; priority: number | string | null; createdAt: number | null }>,
    userTodos: [] as Array<{ id: string; title: string; date: string; remindAt?: number | null; createdAt?: number }>,
    refreshAllBoards: vi.fn(async () => true),
    initFleetStream: vi.fn(),
    startReminderScheduler: vi.fn(),
  }
  return { state, useCockpitStore: () => state }
})
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: cockpitStubs.useCockpitStore }))
vi.mock('@/custom/cockpit/store/cockpit-kv', () => ({
  loadUserTodos: vi.fn(() => cockpitStubs.state.userTodos),
}))

import TriageQueue from '../components/TriageQueue.vue'
import AlarmList from '../components/AlarmList.vue'
import InboxView from '../views/InboxView.vue'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { localDateStr } from '../adapters/overview'
import { TRIAGED_KEY, RESOLVED_KEY, type TriageEntry } from '../adapters/inbox-center'

const HOUR = 3_600_000
const TODAY = localDateStr(new Date())

function entry(partial: Partial<TriageEntry>): TriageEntry {
  return {
    id: 'x:1', kind: 'reminder', severity: 'low', title: '条目', ts: 0, waitMs: 0,
    route: { path: '/app' }, ...partial,
  }
}

function makeRun(runId: string, status = 'awaiting-input') {
  return {
    runId, graphId: `g-${runId}`, status,
    updatedAt: new Date(Date.now() - HOUR).toISOString(),
    stage: null, iteration: 0, cost: 0,
    lastActivityAt: new Date(Date.now() - HOUR).toISOString(),
    events: [], pendingInterruptId: null,
  }
}

function makeRouter(): Router {
  const stub = { template: '<div class="route-stub" />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', component: stub },
      { path: '/app/runs', name: 'ia2.runs', component: stub },
      { path: '/app/runs/:runId', name: 'ia2.runDetail', component: stub },
      { path: '/app/tasks', name: 'ia2.tasks', component: stub },
      { path: '/app/inbox', name: 'ia2.inbox', component: stub },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
  cockpitStubs.state.tasks = []
  cockpitStubs.state.userTodos = []
  approvalPanel.count = 0
})

// ── TriageQueue ──
describe('TriageQueue', () => {
  const pending = [
    entry({ id: 'approval:r1', kind: 'approval', severity: 'high', title: 'r1', subtitle: 'g1', waitMs: HOUR, route: { name: 'ia2.runDetail', params: { runId: 'r1' } }, runId: 'r1' }),
    entry({ id: 'task:t1', kind: 'blocked', severity: 'high', title: '修登录', waitMs: 2 * HOUR, route: { path: '/app/tasks' }, taskId: 't1' }),
  ]

  it('待处理视图渲染条目（kind chip / 标题 / 等待时长），默认即今日待分诊', () => {
    const w = mount(TriageQueue, { props: { pending, done: [], runs: [] } })
    expect(w.text()).toContain('ia2.inbox.tabPending')
    expect(w.text()).toContain('ia2.inbox.tabDone')
    const rows = w.findAll('.tq-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('r1')
    expect(rows[0].text()).toContain('g1')
    expect(rows[0].text()).toContain('ia2.inbox.kind.approval')
    expect(rows[0].text()).toContain('1h0m') // formatDurationMs 等待时长
  })

  it('「标记分诊」emit triage 携带条目；点条目主体 emit open', async () => {
    const w = mount(TriageQueue, { props: { pending, done: [], runs: [] } })
    await w.findAll('.tq-row__action--triage')[0].trigger('click')
    expect(w.emitted('triage')![0][0]).toMatchObject({ id: 'approval:r1' })
    await w.findAll('.tq-row__main')[1].trigger('click')
    expect(w.emitted('open')![0][0]).toMatchObject({ id: 'task:t1' })
  })

  it('审批行内联展开 ApprovalPanel（复用不复制）；非审批行无展开', async () => {
    const runs = [makeRun('r1')]
    const w = mount(TriageQueue, { props: { pending, done: [], runs } })
    const expanders = w.findAll('.tq-row__expand')
    expect(expanders).toHaveLength(1) // 只有审批行有展开钮
    await expanders[0].trigger('click')
    expect(w.find('.approval-stub').exists()).toBe(true)
    expect(w.find('.tq-row--expanded').exists()).toBe(true)
    await expanders[0].trigger('click')
    expect(w.find('.approval-stub').exists()).toBe(false)
  })

  it('已分诊视图：triaged 行有撤销钮、archived 行只有归档徽标', async () => {
    const done = [
      { entry: entry({ id: 'approval:r1', kind: 'approval', severity: 'high', title: 'r1' }), origin: 'triaged' as const },
      { entry: entry({ id: 'approval:r2', kind: 'approval', severity: 'high', title: 'r2' }), origin: 'archived' as const },
    ]
    const w = mount(TriageQueue, { props: { pending: [], done, runs: [] } })
    await w.findAll('.tq-panel__tab')[1].trigger('click')
    const rows = w.findAll('.tq-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('ia2.inbox.originTriaged')
    expect(rows[1].text()).toContain('ia2.inbox.originArchived')
    expect(w.findAll('.tq-row__action--triage')).toHaveLength(0)
    // 撤销钮只在 triaged 行（archived 行只读）
    expect(rows[0].text()).toContain('ia2.inbox.untriage')
    expect(rows[1].text()).not.toContain('ia2.inbox.untriage')
    const rowButtons = rows[0].findAll('.tq-row__actions button')
    await rowButtons[rowButtons.length - 1].trigger('click') // 行内末钮 = 撤销
    expect(w.emitted('untriage')![0][0]).toMatchObject({ id: 'approval:r1' })
  })

  it('空态两 tab 各自文案', async () => {
    const w = mount(TriageQueue, { props: { pending: [], done: [], runs: [] } })
    expect(w.text()).toContain('ia2.inbox.emptyPending')
    await w.findAll('.tq-panel__tab')[1].trigger('click')
    expect(w.text()).toContain('ia2.inbox.emptyDone')
  })
})

// ── AlarmList ──
describe('AlarmList', () => {
  it('渲染告警条目（loop 名 + 等待）并 emit open；空态文案', async () => {
    const w = mount(AlarmList, {
      props: { entries: [entry({ id: 'alarm:l1', kind: 'alarm', title: '晨检循环', waitMs: 2 * HOUR, route: { path: '/app/runs', query: { loop: 'l1' } } })] },
    })
    expect(w.text()).toContain('ia2.inbox.alarmHead')
    expect(w.text()).toContain('晨检循环')
    expect(w.text()).toContain('2h0m')
    await w.find('.alarm-list__item').trigger('click')
    expect(w.emitted('open')![0][0]).toMatchObject({ id: 'alarm:l1' })

    const empty = mount(AlarmList, { props: { entries: [] } })
    expect(empty.text()).toContain('ia2.inbox.alarmEmpty')
  })
})

// ── InboxView 装配 ──
async function mountView() {
  const router = makeRouter()
  router.push('/app/inbox')
  await router.isReady()
  const wrapper = mount(InboxView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('InboxView — 五源装配', () => {
  beforeEach(() => {
    runRest.listRuns.mockResolvedValue([
      { runId: 'r1', graphId: 'g1', status: 'awaiting-input', updatedAt: new Date(Date.now() - HOUR).toISOString() },
      { runId: 'r2', graphId: 'g2', status: 'completed', updatedAt: new Date().toISOString() },
    ])
    loopRest.listLoops.mockResolvedValue([
      { id: 'l1', name: '晨检循环', status: 'running' },
    ])
    loopRest.getEvents.mockResolvedValue([{ type: 'loop.stuck', ts: new Date(Date.now() - 2 * HOUR).toISOString() }])
    cockpitStubs.state.tasks = [
      { id: 't1', title: '修登录页', status: 'blocked', priority: 0, createdAt: Date.now() - 2 * HOUR },
      { id: 't2', title: '审文案', status: 'review', priority: null, createdAt: Date.now() - HOUR },
      { id: 't3', title: '进行中', status: 'doing', priority: null, createdAt: Date.now() - HOUR },
    ]
    cockpitStubs.state.userTodos = [
      { id: 'td1', title: '下午评审', date: TODAY, remindAt: null },
      { id: 'td2', title: '明日事务', date: '2027-01-01', remindAt: null },
    ]
  })

  it('五源入列、非候选状态不进：侧栏六组计数 + 队列条目', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-triage-queue]').exists()).toBe(true)
    expect(wrapper.find('[data-alarm-list]').exists()).toBe(true)
    // 侧栏：全部 + 五源
    expect(wrapper.findAll('.ia-inbox__group')).toHaveLength(6)
    // 队列：审批 r1 + 阻塞 t1 + 待审 t2 + 告警 晨检循环 + 待办 td1（doing/明日不进）
    const text = wrapper.find('[data-triage-queue]').text()
    expect(text).toContain('r1')
    expect(text).toContain('修登录页')
    expect(text).toContain('审文案')
    expect(text).toContain('晨检循环')
    expect(text).toContain('下午评审')
    expect(text).not.toContain('进行中')
    expect(text).not.toContain('明日事务')
    // 侧栏告警列表同步显示
    expect(wrapper.find('[data-alarm-list]').text()).toContain('晨检循环')
  })

  it('源筛选：点「阻塞」组只剩该源条目；点「全部」还原', async () => {
    const { wrapper } = await mountView()
    const groups = wrapper.findAll('.ia-inbox__group')
    await groups[2].trigger('click') // all, approval, blocked…
    let titles = wrapper.findAll('.tq-row__title').map(n => n.text())
    expect(titles).toEqual(['修登录页'])
    await groups[0].trigger('click')
    titles = wrapper.findAll('.tq-row__title').map(n => n.text())
    expect(titles.length).toBeGreaterThan(1)
  })

  it('深链：审批行 → /app/runs/:runId；任务行 → /app/tasks；告警 → /app/runs?loop=', async () => {
    const { wrapper, router } = await mountView()
    const rows = wrapper.findAll('.tq-row')
    const approvalRow = rows.find(r => r.text().includes('r1'))!
    await approvalRow.find('.tq-row__action').trigger('click') // 第 1 钮 = 查看
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/runs/r1')

    const taskRow = wrapper.findAll('.tq-row').find(r => r.text().includes('修登录页'))!
    await taskRow.find('.tq-row__action').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/tasks')

    await wrapper.find('[data-alarm-list] .alarm-list__item').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/runs')
    expect(router.currentRoute.value.query.loop).toBe('l1')
  })

  it('标记分诊 → kv 落当日键 + 条目流转到已分诊', async () => {
    const { wrapper } = await mountView()
    const taskRow = wrapper.findAll('.tq-row').find(r => r.text().includes('修登录页'))!
    await taskRow.find('.tq-row__action--triage').trigger('click')

    const triaged = JSON.parse(localStorage.getItem(TRIAGED_KEY) ?? '{}')
    expect(triaged['task:t1']).toBe(TODAY)
    // 待处理只剩 4 条（r1/晨检/审文案/下午评审），已分诊 tab 有该条
    expect(wrapper.findAll('.tq-row')).toHaveLength(4)
    await wrapper.findAll('.tq-panel__tab')[1].trigger('click')
    expect(wrapper.findAll('.tq-row').map(r => r.text()).join()).toContain('修登录页')
  })

  it('日切重置：昨天的分诊标记失效，条目仍在待处理', async () => {
    localStorage.setItem(TRIAGED_KEY, JSON.stringify({ 'task:t1': '2026-09-09' }))
    const { wrapper } = await mountView()
    expect(wrapper.findAll('.tq-row')).toHaveLength(5)
    await wrapper.findAll('.tq-panel__tab')[1].trigger('click')
    expect(wrapper.findAll('.tq-row')).toHaveLength(0)
  })

  it('就地审批流转 + 自动归档：run 恢复 → 条目离场记 kv 快照，进已分诊（origin archived）', async () => {
    const { wrapper } = await mountView()
    // 审批行展开内联面板（接线冒烟）
    const approvalRow = wrapper.findAll('.tq-row').find(r => r.text().includes('r1'))!
    await approvalRow.find('.tq-row__expand').trigger('click')
    expect(wrapper.find('.approval-stub').exists()).toBe(true)

    // 批准后 run 恢复（store 乐观投影路径：graph.resume → running）
    const store = useRunCenterStore()
    store.applyEvent({ type: 'graph.resume', threadId: 'r1', ts: new Date().toISOString() })
    await flushPromises()

    // 条目离开待处理，自动记档
    expect(wrapper.findAll('.tq-row').map(r => r.text()).join()).not.toContain('r1')
    const resolved = JSON.parse(localStorage.getItem(RESOLVED_KEY) ?? '{}')
    expect(resolved['approval:r1'].entry.id).toBe('approval:r1')
    // 已分诊视图：归档快照可渲染
    await wrapper.findAll('.tq-panel__tab')[1].trigger('click')
    expect(wrapper.findAll('.tq-row').map(r => r.text()).join()).toContain('r1')
    expect(wrapper.text()).toContain('ia2.inbox.originArchived')
  })

  it('核心 HITL 流：reject→repair 重开 interrupt——回待处理且 done 无旧快照；二次离场快照覆盖刷新', async () => {
    const { wrapper } = await mountView()
    const store = useRunCenterStore()
    const queueText = () => wrapper.findAll('.tq-row').map(r => r.text()).join()

    // 第一次离场（批准/拒绝/超时同一 resume 投影）
    store.applyEvent({ type: 'graph.resume', threadId: 'r1', ts: new Date().toISOString() })
    await flushPromises()
    expect(queueText()).not.toContain('r1')
    await wrapper.findAll('.tq-panel__tab')[1].trigger('click')
    expect(queueText()).toContain('r1') // 归档快照可见
    const firstTs = JSON.parse(localStorage.getItem(RESOLVED_KEY)!)['approval:r1'].ts
    await wrapper.findAll('.tq-panel__tab')[0].trigger('click')

    // repair 重开 interrupt → 回到 awaiting-input
    store.applyEvent({
      type: 'graph.interrupt', threadId: 'r1', interruptId: 'i2',
      value: { kind: 'approval', prompt: 'retry' }, ts: new Date().toISOString(),
    })
    await flushPromises()
    expect(queueText()).toContain('r1') // 待处理可见、可再次审批
    await wrapper.findAll('.tq-panel__tab')[1].trigger('click')
    expect(queueText()).not.toContain('r1') // done 压制旧快照——双态不同屏
    await wrapper.findAll('.tq-panel__tab')[0].trigger('click')

    // 二次离场 → 覆盖式重记（ts 刷新，衰减从最新离场起算）
    store.applyEvent({ type: 'graph.resume', threadId: 'r1', interruptId: 'i2', ts: new Date().toISOString() })
    await flushPromises()
    const second = JSON.parse(localStorage.getItem(RESOLVED_KEY)!)['approval:r1']
    expect(Date.parse(second.ts)).toBeGreaterThanOrEqual(Date.parse(firstTs))
    expect(second.entry.id).toBe('approval:r1')
    expect(queueText()).not.toContain('r1')
    await wrapper.findAll('.tq-panel__tab')[1].trigger('click')
    expect(queueText()).toContain('r1')
  })

  it('通知克制：武装动作只发既有订阅/一次性拉取（零新轮询为结构约束——新文件无定时器）', async () => {
    await mountView()
    expect(runRest.listRuns).toHaveBeenCalled()
    expect(runRest.replay).toHaveBeenCalled() // fetchMetrics 采样
    expect(cockpitStubs.state.refreshAllBoards).toHaveBeenCalled()
    expect(cockpitStubs.state.initFleetStream).toHaveBeenCalled()
    expect(cockpitStubs.state.startReminderScheduler).toHaveBeenCalled()
  })
})
