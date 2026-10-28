// @vitest-environment jsdom
// 工作总览首页单测（2026-10-27 Task 4 日常口径）：两区十卡（A 区搭建五步+
// B 区交付五阶段）+状态推导（真实配置信号/任务分布）+引导态分流（组织未建=
// 搭建引导；组织已建无任务=日常空态）+直达路由。
// 单一事实源=stage-meta.ts（SETUP_STEPS/STAGE_META），与 StageShell 同源；
// 本页不读推演 run-state（推演进度回全流程推演区）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }), createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }) }))
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))
vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: () => ({ sortedRuns: [] }) }))

// workspace 数据面（真实 store + 适配器桩）：日常/推演双源由本文件各自播种
const adapters = vi.hoisted(() => ({
  teams: { fetchKanbanOverview: vi.fn() },
  simObserver: { fetchSimObserverOverview: vi.fn() },
  adminRegistry: { fetchRegistry: vi.fn(async () => ({ markdown: '', commit: 'c1' })), saveRegistry: vi.fn() },
  profiles: { fetchProfiles: vi.fn(async () => []) },
}))
vi.mock('@/custom/shared/adapters/teams-adapter', () => adapters.teams)
vi.mock('@/custom/shared/api/sim-observer', () => adapters.simObserver)
vi.mock('@/custom/governance/api/adminRegistry', () => adapters.adminRegistry)
vi.mock('@/api/hermes/profiles', () => adapters.profiles)
vi.mock('@/custom/shared/adapters/task-adapter', () => ({
  toCockpitTask: vi.fn((task: { id: string; title: string; status: string; assignee: string | null; workspace_path: string | null; tenant: string | null; created_at: number }, board: string) => ({
    id: task.id, title: task.title, priority: 'P2' as const, status: task.status,
    assignee: task.assignee, workspace: task.workspace_path, tenant: task.tenant,
    boardSlug: board, createdAt: task.created_at * 1000, sessionId: null,
  })),
}))
vi.mock('@/api/hermes/kanban', () => ({ listBoards: vi.fn(async () => []), listTasks: vi.fn(async () => []) })
)
vi.mock('@/custom/shared/store/cockpit-kv', () => ({ loadUserTodos: vi.fn(() => []), saveUserTodos: vi.fn() }))
vi.mock('@/custom/shared/adapters/fleet-adapter', () => ({ connectOverviewStream: vi.fn(() => ({ close: vi.fn() })) }))

import { authFetch } from '../../ide/utils/auth-fetch'
import { createPinia, setActivePinia } from 'pinia'
import JourneyView from '../views/journey/JourneyView.vue'
import { useWorkspaceStore } from '@/custom/shared/store/workspace'
import { __resetDailySetupSignalsForTest } from '../composables/daily-setup-signals'

const mockedFetch = vi.mocked(authFetch)

const ORG_WITH_ROWS = '| 项 | 值 |\n| --- | --- |\n| 组织 | 示例组织 |'
const ORG_EMPTY = '| 项 | 值 |\n| --- | --- |'

const rawTask = (over: Record<string, unknown> = {}) => ({
  id: 't1', title: '任务 t1', status: 'review', assignee: 'me', priority: 2,
  created_at: 100, completed_at: null, started_at: null, last_heartbeat_at: null,
  tenant: null, session_id: null, workspace_path: null, branch_name: null,
  body: null, result: null, ...over,
})

function makeRouter(initial: string): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', name: 'ia2.journey', component: JourneyView },
      { path: '/app/collab', name: 'ia2.collab', component: { template: '<div />' } },
      { path: '/app/stage/setup', name: 'ia2.stage1', component: { template: '<div />' } },
      { path: '/app/stage/reqs', name: 'ia2.stage2', component: { template: '<div />' } },
      { path: '/app/stage/design', name: 'ia2.stage3', component: { template: '<div />' } },
      { path: '/app/stage/build', name: 'ia2.stage4', component: { template: '<div />' } },
      { path: '/app/stage/accept', name: 'ia2.stage5', component: { template: '<div />' } },
      { path: '/app/stage/govern', name: 'ia2.stage6', component: { template: '<div />' } },
      { path: '/app/accounts', name: 'ia2.accounts', component: { template: '<div />' } },
      { path: '/app/teams', name: 'ia2.teams', component: { template: '<div />' } },
      { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
      { path: '/app/gov/org-assets', name: 'ia2.govOrgAssets', component: { template: '<div />' } },
      { path: '/hermes/agents', name: 'hermes.agentManager', component: { template: '<div />' } },
    ] as RouteRecordRaw[],
  })
}

/** 播种：org 信号 + 日常任务（raw 投影）+ 推演观察面（不得影响本页） */
async function seedWorkspace(daily: Array<Record<string, unknown>>, sim: Array<Record<string, unknown>> = []) {
  const overview = {
    boards: [{ slug: 'main', name: 'Main', total: daily.length }],
    tasks: daily.map(t => ({
      id: t.id as string, title: t.title as string, priority: 'P2' as const, status: t.status as string,
      assignee: 'me', workspace: null, tenant: null, boardSlug: 'main',
      createdAt: 100_000, sessionId: null,
    })),
    rawTasks: daily.map(t => ({ board: 'main', task: t })),
  }
  adapters.teams.fetchKanbanOverview.mockResolvedValue(overview)
  adapters.simObserver.fetchSimObserverOverview.mockResolvedValue({
    available: true, runId: 'run-7', posture: 'standard', startedAt: 1, rooms: [],
    boards: [{ slug: 'main', name: 'Main', total: sim.length }],
    tasks: sim.map(t => ({ board: 'main', task: { ...t, source: 'sim', runId: 'run-7' } })),
  })
  const workspace = useWorkspaceStore()
  await workspace.refreshAllBoards(true)
  return workspace
}

async function mountAt(path: string) {
  const router = makeRouter(path)
  await router.push(path)
  await router.isReady()
  const w = mount(JourneyView, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

describe('JourneyView — 工作总览首页（日常口径）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
    __resetDailySetupSignalsForTest()
    mockedFetch.mockReset()
    adapters.adminRegistry.fetchRegistry.mockImplementation(async (kind: 'org' | 'roster') =>
      Promise.resolve({ markdown: kind === 'org' ? ORG_WITH_ROWS : ORG_EMPTY, commit: 'c1' }))
    adapters.profiles.fetchProfiles.mockImplementation(async () => [])
  })

  it('两区十卡渲染（A 区搭建五步+B 区交付五阶段）；组织未建给搭建引导', async () => {
    adapters.adminRegistry.fetchRegistry.mockImplementation(async () => ({ markdown: ORG_EMPTY, commit: 'c1' }))
    await seedWorkspace([])
    const { w } = await mountAt('/app')
    // A 区五步：组织→账号→团队协调→环境资产→智能体
    const steps = w.findAll('[data-testid^="jrn-step-"]').filter(x => /jrn-step-\d+$/.test(x.attributes('data-testid') ?? ''))
    expect(steps).toHaveLength(5)
    expect(w.find('[data-testid="jrn-step-1"]').text()).toContain('建立组织')
    expect(w.find('[data-testid="jrn-step-3"]').text()).toContain('建立团队与协调关系')
    expect(w.find('[data-testid="jrn-step-5"]').text()).toContain('准备智能体')
    // B 区五阶段：与顶栏②-⑥同构（需求→分析设计→开发→验收→治理）
    expect(w.findAll('[data-testid^="jrn-stage-"]')).toHaveLength(5)
    expect(w.find('[data-testid="jrn-stage-2"]').text()).toContain('需求')
    expect(w.find('[data-testid="jrn-stage-6"]').text()).toContain('治理')
    // 组织未建（org/accounts 表皆空行）：搭建引导（去建立组织）
    const guide = w.find('[data-testid="jrn-guide"]')
    expect(guide.exists()).toBe(true)
    expect(guide.text()).toContain('建立组织')
    await w.find('[data-testid="jrn-start"]').trigger('click')
    await flushPromises()
    w.unmount()
  })

  it('卡片点击直达真实路由（团队管理/治理阶段），搭建步带来路阶段①', async () => {
    await seedWorkspace([])
    const { w, router } = await mountAt('/app')
    await w.find('[data-testid="jrn-step-3"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.teams')
    // 减负批：A 区步骤统一带 from=1，落点页顶栏高亮按搭建语境（团队/账号/环境跨阶段复用）
    expect(router.currentRoute.value.query.from).toBe('1')
    await w.find('[data-testid="jrn-stage-6"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.stage6')
    w.unmount()
  })

  it('日常口径状态推导：五步读配置信号；后续阶段有工作=已流转（非完成）；sim 卡不参与', async () => {
    await seedWorkspace(
      [rawTask({ id: 'd1', title: '日常在办', status: 'running' })],
      [rawTask({ id: 's1', title: '推演完成', status: 'done' })],
    )
    const { w } = await mountAt('/app?run=r')
    // 不读推演 run-state：?run= 深链也不发 run-state 请求
    expect(mockedFetch).not.toHaveBeenCalled()
    // A 区：org 有数据行=完成；roster 空=待完成（current 序首）；teams 无信号=未跟踪
    expect(w.find('[data-testid="jrn-step-state-1"]').text()).toContain('完成')
    expect(w.find('[data-testid="jrn-step-state-2"]').text()).toContain('待完成')
    expect(w.find('[data-testid="jrn-step-3"]').text()).toContain('未纳入跟踪')
    // B 区：④ running=进行中；② 后续有工作=已流转（不展示「完成」）
    expect(w.find('[data-testid="jrn-state-4"]').text()).toContain('进行中')
    expect(w.find('[data-testid="jrn-state-2"]').text()).toContain('已流转')
    expect(w.find('[data-testid="jrn-state-2"]').text()).not.toContain('完成')
    // sim done 卡不得把任何阶段推成完成/进行中（⑥ 未开始）
    expect(w.find('[data-testid="jrn-state-6"]').text()).toContain('未开始')
    // 旧推演卡点条与 run-state 错误行退役
    expect(w.find('[data-testid="jrn-bottleneck"]').exists()).toBe(false)
    expect(w.find('[data-testid="jrn-error"]').exists()).toBe(false)
    w.unmount()
  })

  it('组织已建且无日常任务：日常空态引导（工作台/看板），不再提「运行」', async () => {
    adapters.adminRegistry.fetchRegistry.mockImplementation(async () => ({ markdown: ORG_WITH_ROWS, commit: 'c1' }))
    await seedWorkspace([])
    const { w } = await mountAt('/app')
    expect(w.find('[data-testid="jrn-guide"]').exists()).toBe(false)
    const daily = w.find('[data-testid="jrn-guide-daily"]')
    expect(daily.exists()).toBe(true)
    expect(daily.text()).not.toContain('运行')
    await w.find('[data-testid="jrn-daily-workbench"]').trigger('click')
    await flushPromises()
    w.unmount()
  })
})
