// @vitest-environment jsdom
// 六阶段页签化守门（2026-10-18 阶段页页签批）：
//   1) 每阶段只有一层页签，默认签与 ?tab= 解析正确；
//   2) 页签点击写 query，刷新/分享保持；
//   3) ①五步按钮切本页页签（不再整页跳转）；
//   4) ②启动准备只核对条件并跳运行编排；⑤验收总览给四个真实出口；
//   5) 面包屑显示「流程总览＞阶段＞页签」，无「中心」字样。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))

const progressState = vi.hoisted(() => ({
  run: 'run21',
  stage: { 1: 'done', 2: 'current' } as Record<number, string>,
}))
vi.mock('../composables/useStageProgress', async () => {
  const { ref } = await import('vue')
  return {
    useStageProgress: () => ({
      run: ref(progressState.run),
      state: ref({ steps: {}, gates: { g1_frozen: '1', g5_ready: '1' }, posture: 'standard', ledger: { open: 0 } }),
      loading: ref(false),
      error: ref(''),
      load: vi.fn(),
      merged: ref({ g1_frozen: '1', g5_ready: '1' }),
      stageState: (no: number) => progressState.stage[no] ?? 'pending',
      stepState: (st: { key: string; keys: string[] }) => {
        if (st.key === 'org') return 'done'
        if (st.key === 'accounts') return 'current'
        if (st.keys.length === 0) return 'untracked'
        return 'pending'
      },
    }),
  }
})

vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => ({
  __isTeleport: false,
  __isKeepAlive: false,
  default: { name: 'SwarmKanbanView', template: '<div data-testid="kanban-stub" />' },
}))
// 阶段页 RunSelector 依赖运行列表：桩化空列表，避免 Pinia/runcenter 重链
vi.mock('@/custom/loop/runcenter/store/runs', () => ({
  useRunCenterStore: () => ({ sortedRuns: [] }),
}))

vi.mock('../composables/useDailyStageProgress', async () => {
  const { ref } = await import('vue')
  return {
    useDailyStageProgress: () => ({
      tasks: ref([]),
      stageCount: () => 0,
      stageState: (no: number) => progressState.stage[no] ?? 'pending',
      stepState: () => 'current',
    }),
  }
})

import StageShell from '../views/stage/StageShell.vue'

const stubs = {
  OrgEditor: { name: 'OrgEditor', template: '<div data-testid="org-stub" />' },
  StageGatePanel: {
    name: 'StageGatePanel',
    props: ['gates'],
    template: '<div data-testid="gate-stub" :data-gates="(gates || []).join(\',\')" />',
  },
  ClearancePanel: { name: 'ClearancePanel', template: '<div data-testid="clearance-stub" />' },
  TracePanel: {
    name: 'TracePanel',
    props: ['onlyUnjudged'],
    template: '<div data-testid="trace-stub" :data-only="String(!!onlyUnjudged)" />',
  },
  StageDevToday: { name: 'StageDevToday', template: '<div data-testid="today-stub" />' },
  StageSetupSteps: { name: 'StageSetupSteps', template: '<div data-testid="setup-steps-stub" />' },
  StageRequirementsOverview: { name: 'StageRequirementsOverview', template: '<div data-testid="requirements-stub" />' },
  StagePreflight: { name: 'StagePreflight', template: '<div data-testid="stg-preflight" />' },
  StageAcceptanceOverview: { name: 'StageAcceptanceOverview', template: '<div data-testid="accept-overview-stub" />' },
  DailyTracePanel: { name: 'DailyTracePanel', template: '<div data-testid="daily-trace-stub" />' },
  DailyDeliveryPanel: { name: 'DailyDeliveryPanel', template: '<div data-testid="daily-delivery-stub" />' },
  DailyUatPanel: { name: 'DailyUatPanel', template: '<div data-testid="daily-uat-stub" />' },
  DailyG5Panel: { name: 'DailyG5Panel', template: '<div data-testid="daily-g5-stub" />' },
  StageSchedulePanel: { name: 'StageSchedulePanel', template: '<div data-testid="schedule-stub" />' },
  StageAssetsPanel: { name: 'StageAssetsPanel', template: '<div data-testid="assets-stub" />' },
  StageRiskPanel: { name: 'StageRiskPanel', template: '<div data-testid="risk-stub" />' },
  StageMetricsPanel: { name: 'StageMetricsPanel', template: '<div data-testid="metrics-stub" />' },
  GatekeeperSection: { name: 'GatekeeperSection', template: '<div data-testid="approvals-stub" />' },
  StageDevApprovals: { name: 'StageDevApprovals', template: '<div data-testid="dev-approvals-stub" />' },
  ApprovalPanel: { name: 'ApprovalPanel', template: '<div data-testid="approval-panel-stub" />' },
  StageG5Panel: { name: 'StageG5Panel', template: '<div data-testid="g5-panel-stub" />' },
  DeliveryPanel: { name: 'DeliveryPanel', template: '<div data-testid="delivery-stub" />' },
  GovIssuesPanel: { name: 'GovIssuesPanel', template: '<div data-testid="issues-stub" />' },
  SwarmKanbanView: { name: 'SwarmKanbanView', template: '<div data-testid="kanban-stub" />' },
  OrchestrationView: { name: 'OrchestrationView', template: '<div data-testid="launch-stub" />' },
}

function makeRouter(stage: number, initial: string): Router {
  const routes: RouteRecordRaw[] = [
    { path: '/x', name: `ia2.stage${stage}` as 'ia2.stage1', component: StageShell, props: { stage } },
    { path: '/app/collab', name: 'ia2.collab', component: { template: '<div />' } },
    { path: '/app/inbox', name: 'ia2.inbox', component: { template: '<div />' } },
    { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
    { path: '/app/sim/orchestration', name: 'ia2.simOrchestration', component: { template: '<div />' } },
  ]
  return createRouter({ history: createMemoryHistory(), routes })
}

async function mountStage(stage: number, query = '') {
  const router = makeRouter(stage, `/x${query}`)
  await router.push(`/x${query}`)
  await router.isReady()
  const w = mount(StageShell, {
    props: { stage: stage as 1 },
    global: { plugins: [router], stubs },
  })
  await flushPromises()
  return { w, router }
}

beforeEach(() => { localStorage.clear() })

describe('StageShell — 单层页签', () => {
  it('①搭建：默认五步进度签，五个步骤到位，无「进入 →」工具卡', async () => {
    const { w } = await mountStage(1)
    expect(w.find('[data-testid="stg-page-1"]').exists()).toBe(true)
    expect(w.text()).toContain('搭建：建立组织、账号与资产')
    expect(w.find('[data-testid="setup-steps-stub"]').exists()).toBe(true)
    expect(w.text()).not.toContain('进入 →')
    expect(w.find('[data-testid="stg-tab-steps"]').classes()).toContain('stg__tab--on')
    w.unmount()
  })

  it('①五步按钮切本页页签（写 query，不整页跳转）', async () => {
    const { w, router } = await mountStage(1)
    await w.find('[data-testid="stg-tab-org"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('org')
    expect(w.find('[data-testid="org-stub"]').exists()).toBe(true)
    expect(w.find('[data-testid="stg-tab-org"]').classes()).toContain('stg__tab--on')
    w.unmount()
  })

  it('②需求：四个页签；默认需求与冻结；G1 页签按 G1 过滤', async () => {
    const { w, router } = await mountStage(2)
    for (const key of ['reqs', 'docs', 'g1', 'preflight']) {
      expect(w.find(`[data-testid="stg-tab-${key}"]`).exists(), key).toBe(true)
    }
    expect(w.find('[data-testid="stg-tab-launch"]').exists()).toBe(false)
    expect(w.find('[data-testid="stg-tab-reqs"]').classes()).toContain('stg__tab--on')
    expect(w.find('[data-testid="requirements-stub"]').exists()).toBe(true)
    await w.find('[data-testid="stg-tab-g1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('g1')
    expect(w.find('[data-testid="gate-stub"]').attributes('data-gates')).toBe('G1')
    w.unmount()
  })

  it('②启动准备是显式跨区入口（不在阶段页假装启动）', async () => {
    const { w } = await mountStage(2, '?tab=preflight')
    expect(w.find('[data-testid="stg-preflight"]').exists()).toBe(true)
    expect(w.find('[data-testid="stg-run-hint"]').exists()).toBe(false)
    w.unmount()
  })

  it('②旧 ?tab=launch 深链回退启动准备（不静默落需求页）', async () => {
    const { w } = await mountStage(2, '?tab=launch')
    expect(w.find('[data-testid="stg-preflight"]').exists()).toBe(true)
    expect(w.find('[data-testid="stg-tab-preflight"]').classes()).toContain('stg__tab--on')
    w.unmount()
  })

  it('⑤验收使用日常面板；推演只是参照链接', async () => {
    const { w, router } = await mountStage(5)
    expect(w.find('[data-testid="stg-tab-overview"]').classes()).toContain('stg__tab--on')
    expect(w.find('[data-testid="accept-overview-stub"]').exists()).toBe(true)
    for (const key of ['trace', 'delivery', 'uat', 'g5']) {
      await w.find(`[data-testid="stg-tab-${key}"]`).trigger('click')
      await flushPromises()
    }
    expect(router.currentRoute.value.query.tab).toBe('g5')
    expect(w.find('[data-testid="daily-trace-stub"]').exists()).toBe(false)
    expect(w.find('[data-testid="daily-delivery-stub"]').exists()).toBe(false)
    expect(w.find('[data-testid="daily-uat-stub"]').exists()).toBe(false)
    expect(w.find('[data-testid="daily-g5-stub"]').exists()).toBe(true)
    w.unmount()
  })

  it('⑥治理：页签齐全，默认遗留项清算；旧 gov 签可由 query 直达', async () => {
    const { w } = await mountStage(6)
    for (const key of ['clearance', 'issues', 'audit', 'reviewGov', 'improve', 'metrics', 'docs', 'gateLog']) {
      expect(w.find(`[data-testid="stg-tab-${key}"]`).exists(), key).toBe(true)
    }
    expect(w.find('[data-testid="clearance-stub"]').exists()).toBe(true)
    expect(w.find('[data-testid="stg-tab-clearance"]').classes()).toContain('stg__tab--on')
    w.unmount()

    const second = await mountStage(6, '?tab=issues')
    expect(second.w.find('[data-testid="issues-stub"]').exists()).toBe(true)
    second.w.unmount()
  })

  it('④开发主操作=页内打开看板（不跳整页）', async () => {
    const { w, router } = await mountStage(4)
    expect(w.find('[data-testid="today-stub"]').exists()).toBe(true)
    await w.find('[data-testid="stg-primary"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('board')
    expect(w.find('[data-testid="stg-tab-board"]').classes()).toContain('stg__tab--on')
    w.unmount()
  })

  it('面包屑：流程总览＞阶段＞页签，无「中心」字样', async () => {
    const { w } = await mountStage(2)
    const nav = w.find('[data-testid="ia-breadcrumb"]')
    expect(nav.exists()).toBe(true)
    const text = nav.text()
    expect(text).toContain('流程总览')
    expect(text).toContain('② 需求')
    expect(text).toContain('需求与冻结')
    expect(text).not.toContain('中心')
    w.unmount()
  })
})
