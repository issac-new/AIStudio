// @vitest-environment jsdom
// 推演壳与状态表达一致性守门（2026-10-27 产品一致性 Task 9）：
//   1) 无重复导航：中央四签页签条退役，推演左栏（IaSideNav·SIM_NAVS）是唯一导航；
//      四个兄弟路由与 v-show 面板映射保持不变；
//   2) run/from 保留：左栏推演域内互跳保留 run/from（原 SimCenterView.goTab 的
//      contextQuery 白名单迁入 go()）；跳出推演域不带推演运行上下文；
//   3) 当前运行不说无历史：RunSelector 分区——当前运行单独呈现（可读名，目录名
//      进 title），历史列表只列其他运行；无其他记录显示「无其他历史运行」，
//      「暂无历史运行」全页退役；
//   4) 证据缺失不形成完成绿灯：DirectorPanel 统计卡各自标注口径（本轮运行步骤/
//      历史门判定/清算台账），OverviewPanel 核实行标「当前证据核验」；缺件不得
//      汇总成「交付完整」语义；
//   5) 只读文案准确：运行编排/业务地图的只读范围与实际能力一致（场景规格可编辑/
//      标注可协同编辑）；页面标题词条仍走 page-presentation 单一解析，不另开第二套。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'
import { buildHistoryOptions } from '../utils/run-options'
import { pageTitle } from '../page-presentation'

// ── 桩面：与 sim-center-shell.test.ts / side-nav.test.ts 同源的最小桩 ──
const runsStoreStub = vi.hoisted(() => ({
  sortedRuns: [] as Array<{ runId: string }>,
  loading: false,
  error: '',
}))
const runStateValue = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }))
const deliverablesValue = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }))

vi.mock('@/custom/loop/runcenter/store/runs', () => ({
  useRunCenterStore: () => runsStoreStub,
}))
vi.mock('@/custom/shared/store/workspace', () => ({ useWorkspaceStore: () => ({ rawTasks: [] }) }))
vi.mock('../composables/useDecisionRows', async () => {
  const { ref } = await import('vue')
  return { useDecisionRows: () => ({ decisionRows: ref([]) }) }
})
vi.mock('../composables/useDailyStageProgress', async () => {
  const { ref } = await import('vue')
  return {
    useDailyStageProgress: () => ({
      run: ref(''), state: ref(null), loading: ref(false), error: ref(''),
      load: vi.fn(), merged: ref({}),
      stageState: () => 'pending', stepState: () => 'pending',
    }),
  }
})
vi.mock('../composables/useSideNavBadges', async () => {
  const { ref } = await import('vue')
  return { useSideNavBadges: () => ({ badges: ref({}), blockedCount: ref(0) }) }
})
vi.mock('../api/overview', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    fetchRunState: vi.fn(() =>
      runStateValue.value ? Promise.resolve(runStateValue.value) : Promise.reject(new Error('no-run'))),
    fetchDeliverables: vi.fn(() =>
      deliverablesValue.value ? Promise.resolve(deliverablesValue.value) : Promise.reject(new Error('no-run'))),
    fetchIssues: vi.fn().mockRejectedValue(new Error('no-run')),
    fetchBranches: vi.fn().mockRejectedValue(new Error('no-run')),
  }
})
// 导演台网络面全桩拒绝（纯函数 pendingGatesOf/recentEventRows 保留真实实现）
vi.mock('../api/sim-director', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    fetchDirectorScenarios: vi.fn().mockRejectedValue(new Error('off')),
    fetchSimLaunchStatus: vi.fn().mockRejectedValue(new Error('off')),
    fetchGraphRun: vi.fn().mockRejectedValue(new Error('off')),
    fetchGraphEvents: vi.fn().mockRejectedValue(new Error('off')),
  }
})

const { default: SimCenterView } = await import('../views/sim/SimCenterView.vue')
const { default: IaSideNav } = await import('../components/IaSideNav.vue')
const { default: RunSelector } = await import('../views/sim/RunSelector.vue')

const SIM_SHELL_PATHS = [
  { path: '/app/sim', name: 'ia2.sim' },
  { path: '/app/sim/supervision', name: 'ia2.simSupervision' },
  { path: '/app/sim/ops', name: 'ia2.simOps' },
  { path: '/app/sim/evidence', name: 'ia2.simEvidence' },
] as const

/** 推演壳路由：四签兄弟路由挂真实 SimCenterView（同 sim-center-shell.makeSimRouter） */
function makeSimRouter(): Router {
  const ActionStub = { template: '<div />' }
  const records: RouteRecordRaw[] = [
    ...SIM_SHELL_PATHS.map(({ path, name }) => ({ path, name, component: SimCenterView })),
    { path: '/app/sim/orchestration', name: 'ia2.simOrchestration', component: ActionStub },
    { path: '/app/sim/settings', name: 'ia2.simSettings', component: ActionStub },
    { path: '/app/sim/director/:runId', name: 'ia2.simDirectorRun', component: ActionStub },
  ]
  return createRouter({ history: createMemoryHistory(), routes: records })
}

/** 左栏导航路由：推演域 + 日常侧最小面 */
function makeNavRouter(): Router {
  const Stub = { template: '<div />' }
  const records: RouteRecordRaw[] = [
    ...SIM_SHELL_PATHS.map(({ path, name }) => ({ path, name, component: Stub })),
    { path: '/app/sim/orchestration', name: 'ia2.simOrchestration', component: Stub },
    { path: '/app/sim/map', name: 'ia2.simMap', component: Stub },
    { path: '/app/sim/settings', name: 'ia2.simSettings', component: Stub },
    { path: '/app/collab', name: 'ia2.collab', component: Stub },
    { path: '/app/board', name: 'ia2.board', component: Stub },
  ]
  return createRouter({ history: createMemoryHistory(), routes: records })
}

async function mountShellAt(fullPath: string) {
  const router = makeSimRouter()
  await router.push(fullPath)
  await router.isReady()
  const w = mount(SimCenterView, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

async function mountNavAt(fullPath: string) {
  const router = makeNavRouter()
  await router.push(fullPath)
  await router.isReady()
  const w = mount(IaSideNav, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

function visible(el: { exists: () => boolean; element: HTMLElement }): boolean {
  return el.exists() && el.element.style.display !== 'none'
}

beforeEach(() => {
  localStorage.clear()
  runsStoreStub.sortedRuns = []
  runsStoreStub.loading = false
  runsStoreStub.error = ''
  runStateValue.value = null
  deliverablesValue.value = null
})

// ── 1) 无重复导航 ────────────────────────────────────────────────────
describe('推演壳：中央页签条退役，左栏是唯一导航', () => {
  it('SimCenterView 不再渲染任何页签条（role=tab/页签类名/页签 testid 全退役）', async () => {
    const { w } = await mountShellAt('/app/sim?run=20261026-run-a')
    expect(w.findAll('[role="tab"]').length).toBe(0)
    expect(w.find('[role="tablist"]').exists()).toBe(false)
    expect(w.find('.sim-center__tabs').exists()).toBe(false)
    expect(w.html()).not.toContain('ia-sim-tab-')
    w.unmount()
  })

  it('四签内容映射保留：四面板在位，默认签=导演台可见、其余三签隐藏', async () => {
    const { w } = await mountShellAt('/app/sim?run=20261026-run-a')
    for (const key of ['overview', 'supervision', 'ops', 'evidence']) {
      expect(w.find(`[data-testid="ia-sim-panel-${key}"]`).exists(), key).toBe(true)
    }
    expect(visible(w.find('[data-testid="ia-sim-panel-overview"]'))).toBe(true)
    for (const key of ['supervision', 'ops', 'evidence']) {
      expect(visible(w.find(`[data-testid="ia-sim-panel-${key}"]`)), key).toBe(false)
    }
    // 页头签名仍出 sim-tabs 词表（单一事实源继续被消费）
    expect(w.find('.sim-center__title').text()).toContain('导演台')
    w.unmount()
  })

  it('深链换签：面板与页头签名随路由跟随', async () => {
    const { w, router } = await mountShellAt('/app/sim?run=20261026-run-a')
    await router.push('/app/sim/evidence')
    await flushPromises()
    expect(visible(w.find('[data-testid="ia-sim-panel-evidence"]'))).toBe(true)
    expect(visible(w.find('[data-testid="ia-sim-panel-overview"]'))).toBe(false)
    expect(w.find('.sim-center__title').text()).toContain('证据库')
    w.unmount()
  })

  it('左栏推演组四签入口在位（SIM_NAVS 单一源）', async () => {
    const { w } = await mountNavAt('/app/sim')
    for (const id of ['ia-side-nav-sim', 'ia-side-nav-sim-supervision', 'ia-side-nav-sim-ops', 'ia-side-nav-sim-evidence']) {
      expect(w.find(`[data-testid="${id}"]`).exists(), id).toBe(true)
    }
    w.unmount()
  })
})

// ── 2) run/from 保留（左栏承接，原 goTab contextQuery 迁移） ─────────
describe('左栏导航：run/from 上下文保留', () => {
  it('推演域内签间互跳保留 run/from', async () => {
    const { w, router } = await mountNavAt('/app/sim?run=20261026-run-a&from=3')
    await w.find('[data-testid="ia-side-nav-sim-ops"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.simOps')
    expect(router.currentRoute.value.query).toMatchObject({ run: '20261026-run-a', from: '3' })
    w.unmount()
  })

  it('同签点击不导航（fullPath 不变）', async () => {
    const { w, router } = await mountNavAt('/app/sim/ops?run=20261026-run-a')
    const before = router.currentRoute.value.fullPath
    await w.find('[data-testid="ia-side-nav-sim-ops"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(before)
    w.unmount()
  })

  it('跳出推演域（返回日常工作台）不带推演运行上下文', async () => {
    const { w, router } = await mountNavAt('/app/sim?run=20261026-run-a&from=3')
    await w.find('[data-testid="ia-side-nav-back-daily"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.collab')
    expect(router.currentRoute.value.query.run).toBeUndefined()
    expect(router.currentRoute.value.query.from).toBeUndefined()
    w.unmount()
  })
})

// ── 3) 当前运行不说无历史 ────────────────────────────────────────────
describe('RunSelector：当前运行与历史运行分区', () => {
  async function mountSelectorAt(fullPath: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } }],
    })
    await router.push(fullPath)
    await router.isReady()
    const w = mount(RunSelector, { global: { plugins: [router] } })
    await flushPromises()
    return { w, router }
  }

  it('当前运行单独呈现：可读日期为主文案，目录名收进 title；历史列表只列其他运行', async () => {
    runsStoreStub.sortedRuns = [
      { runId: 'sim-20261026-run-a' },
      { runId: 'sim-20261026-run-b' },
    ]
    const { w } = await mountSelectorAt('/app/sim?run=20261026-run-a')
    const current = w.find('[data-testid="sim-run-current"]')
    expect(current.exists()).toBe(true)
    expect(current.text()).toContain('2026 年 10 月 26 日运行')
    expect(current.attributes('title')).toBe('20261026-run-a')
    const history = w.find('select')
    expect(history.exists()).toBe(true)
    const optionValues = history.findAll('option').map(o => o.attributes('value'))
    expect(optionValues).toEqual(['', '20261026-run-b'])
    w.unmount()
  })

  it('历史运行切换写 ?run=', async () => {
    runsStoreStub.sortedRuns = [
      { runId: 'sim-20261026-run-a' },
      { runId: 'sim-20261026-run-b' },
    ]
    const { w, router } = await mountSelectorAt('/app/sim?run=20261026-run-a')
    await w.find('select').setValue('20261026-run-b')
    await flushPromises()
    expect(router.currentRoute.value.query.run).toBe('20261026-run-b')
    w.unmount()
  })

  it('无其他记录：显示「无其他历史运行」；「暂无历史运行」退役', async () => {
    // 已选运行（导演 run 深链）+ 运行列表为空：旧文案会同时说「暂无历史运行」
    const { w } = await mountSelectorAt('/app/sim?run=run-sim-director-mvgar1sm')
    expect(w.find('[data-testid="sim-run-current"]').text()).toContain('导演运行')
    expect(w.find('[data-testid="sim-run-history-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="sim-run-history-empty"]').text()).toContain('无其他历史运行')
    expect(w.text()).not.toContain('暂无历史运行')
    w.unmount()
  })

  it('壳级集成：SimCenterView 页头同样不说「暂无历史运行」', async () => {
    const { w } = await mountShellAt('/app/sim?run=run-sim-director-mvgar1sm')
    expect(w.text()).toContain('无其他历史运行')
    expect(w.text()).not.toContain('暂无历史运行')
    w.unmount()
  })
})

describe('buildHistoryOptions：历史清单=当前运行之外（纯函数）', () => {
  it('剔除当前运行、sim- 前缀归一、去重与上限截断', () => {
    expect(buildHistoryOptions(['sim-a', 'a', 'b', 'c'], 'a')).toEqual(['b', 'c'])
    expect(buildHistoryOptions(['x'], 'x')).toEqual([])
    expect(buildHistoryOptions([], 'x')).toEqual([])
    const many = Array.from({ length: 50 }, (_, i) => `r${i}`)
    expect(buildHistoryOptions(many, '')).toHaveLength(40)
  })
})

// ── 4) 统计卡口径标注；证据缺失不形成完成绿灯 ───────────────────────
describe('DirectorPanel：统计卡口径标注', () => {
  it('KPI 四卡渲染：步骤/质量门/遗留各带口径词，人不被汇总成「交付完整」', async () => {
    runStateValue.value = {
      run: '20261026-run-a', posture: 'standard',
      gates: {}, steps: {},
      ledger: { total: 3, open: 3, byType: {} },
      source: { stateFile: 'x', ledgerFile: 'y', ledgerPresent: true },
    }
    deliverablesValue.value = {
      run: '20261026-run-a',
      deliverables: [
        { name: 'final-report', label: '最终报告', status: 'present', file: 'final-report.html' },
        { name: 'trace-matrix', label: '追溯矩阵', status: 'absent', file: null },
      ],
      scanned: 103,
    }
    const { w } = await mountShellAt('/app/sim?run=20261026-run-a')
    const steps = w.find('[data-testid="director-kpi-steps"]')
    expect(steps.text()).toContain('步骤完成')
    expect(steps.text()).toContain('本轮运行')
    const gates = w.find('[data-testid="director-kpi-gates"]')
    expect(gates.text()).toContain('质量门通过')
    expect(gates.text()).toContain('历史门判定')
    const ledger = w.find('[data-testid="director-kpi-ledger"]')
    expect(ledger.text()).toContain('未清遗留')
    expect(ledger.text()).toContain('台账')
    expect(ledger.text()).toContain('3')
    // 证据缺失不得汇总成完成语义
    expect(w.text()).not.toContain('交付完整')
    // 证据核实行带「当前证据核验」口径
    expect(w.text()).toContain('当前证据核验')
    expect(w.text()).toContain('103')
    w.unmount()
  })

  it('harness 页头运行名走可读日期（目录名收进 title，不裸露）', async () => {
    runStateValue.value = {
      run: '20261026-run-a', posture: 'standard',
      gates: {}, steps: {},
      ledger: { total: 0, open: 0, byType: {} },
      source: { stateFile: 'x', ledgerFile: 'y', ledgerPresent: true },
    }
    const { w } = await mountShellAt('/app/sim?run=20261026-run-a')
    const head = w.find('[data-testid="director-head"]')
    expect(head.exists()).toBe(true)
    expect(head.text()).toContain('2026 年 10 月 26 日运行')
    expect(head.text()).not.toContain('20261026-run-a')
    w.unmount()
  })
})

describe('原始技术信息收进折叠详情（源级守门）', () => {
  const dirSrc = readFileSync(resolve(__dirname, '../views/sim/DirectorPanel.vue'), 'utf8')
  const ovSrc = readFileSync(resolve(__dirname, '../views/sim/OverviewPanel.vue'), 'utf8')

  it('统计卡口径词条与 title 说明成对（zh 源级）', () => {
    expect(dirSrc).toContain('步骤完成（本轮运行）')
    expect(dirSrc).toContain('质量门通过（历史门判定）')
    expect(dirSrc).toContain('未清遗留项（清算台账）')
    expect(dirSrc).not.toContain('交付完整')
    expect(ovSrc).toContain('当前证据核验')
    expect(ovSrc).not.toContain('交付完整')
  })

  it('启动器 PID/退出码/原始时间戳收进 details（运行行不内联）', () => {
    // 进程原始参数收进既有 collapsible 形态；运行行（dir__launch-run 区块）只留运行名与停止
    expect(dirSrc).toContain('<summary>进程详情</summary>')
    expect(dirSrc).not.toMatch(/dir__launch-run[\s\S]{0,300}?(PID|startedAt|lastExit)/)
  })
})

// ── 5) 只读文案准确 ──────────────────────────────────────────────────
describe('只读文案与实际能力一致', () => {
  it('运行编排：图运行清单只读、场景规格可编辑；旧「运行编排（只读）」退役', () => {
    const src = readFileSync(resolve(__dirname, '../views/sim/SimOrchestrationView.vue'), 'utf8')
    expect(src).not.toContain('运行编排（只读）')
    expect(src).toContain('图运行清单只读，场景规格可编辑')
    // 页面标题词条仍走 page-presentation 单一解析（不另开第二套）
    expect(pageTitle({ fullPath: '/app/sim/orchestration', name: 'ia2.simOrchestration' }, 'zh')).toBe('运行编排')
  })

  it('业务地图：图谱只读、标注可协同编辑；旧「词面命中画布化（只读）」退役', () => {
    const src = readFileSync(resolve(__dirname, '../views/sim/BusinessMapView.vue'), 'utf8')
    expect(src).not.toContain('词面命中画布化（只读）')
    expect(src).toContain('图谱只读，标注可协同编辑')
    expect(pageTitle({ fullPath: '/app/sim/map', name: 'ia2.simMap' }, 'zh')).toBe('业务地图')
  })
})
