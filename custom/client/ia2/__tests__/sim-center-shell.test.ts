// @vitest-environment jsdom
// 全流程推演专区壳守门（2026-10-18 推演区批，原仿真中心）：
//   1) 四签路由可达：运行总览 / 监督面板 / 运行监控 / 证据库；
//   2) 交付健康/需求追溯已迁⑤验收，旧 /app/sim/* 深链 redirect 到阶段页；
//   3) 默认签=运行总览；页头签名文案来自 sim-tabs 单一事实源；
//   4) 2026-10-27 产品一致性 Task 9：中央四签页签条退役（与左栏 SIM_NAVS 重复），
//      左栏是唯一推演导航（run/from 保留守门在 sim-shell-coherence.test.ts）；
//      页面不再渲染「签 N」与「待实现/端点清单」占位；
//   5) /app/runs 家族重定向与 V1 壳收敛规则保持不变。
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'
import { buildIaRoutes } from '../routes'
import SimCenterView from '../views/sim/SimCenterView.vue'
import { SIM_TABS_TEXT } from '../views/sim/sim-tabs'

vi.mock('@/custom/loop/runcenter/store/runs', () => ({
  useRunCenterStore: () => ({ sortedRuns: [] }),
}))
// 2026-10-21 两体系分流：SimCenterView 经 useRunContext('sim') 读当前运行；
// 桩化为可控值（导演 run 前缀 run-sim-director-* 触发 legacy 三签内联态）。
const simRunState = vi.hoisted(() => ({ value: 'p2-verify-20261019' }))
vi.mock('../composables/useRunContext', async () => {
  const { ref } = await import('vue')
  return { useRunContext: () => ({ run: ref(simRunState.value) }) }
})
vi.mock('@/custom/shared/store/workspace', () => ({ useWorkspaceStore: () => ({ rawTasks: [] }) }))
vi.mock('../composables/useDecisionRows', async () => {
  const { ref } = await import('vue')
  return { useDecisionRows: () => ({ decisionRows: ref([]) }) }
})
vi.mock('../api/overview', () => ({
  fetchRunState: vi.fn().mockRejectedValue(new Error('no-run')),
  fetchDeliverables: vi.fn().mockRejectedValue(new Error('no-run')),
  fetchIssues: vi.fn().mockRejectedValue(new Error('no-run')),
  fetchBranches: vi.fn().mockRejectedValue(new Error('no-run')),
}))

/** 四签文案（zh）；运行编排/推演设置已归独立专区页（2026-10-21 IA 收口） */
const FOUR_TAB_LABELS = ['导演台', '监督面板', '运行监控', '证据库'] as const
const stubs = {}

/** v-show 可见性（jsdom 下 v-show 摘 style.display） */
function visible(el: { exists: () => boolean; element: HTMLElement }): boolean {
  return el.exists() && el.element.style.display !== 'none'
}

const SIM_PATHS: ReadonlyArray<{ path: string; name: string }> = [
  { path: '/app/sim', name: 'ia2.sim' },
  { path: '/app/sim/supervision', name: 'ia2.simSupervision' },
  { path: '/app/sim/ops', name: 'ia2.simOps' },
  { path: '/app/sim/evidence', name: 'ia2.simEvidence' },
]
const SIM_ACTION_PATHS: ReadonlyArray<{ path: string; name: string }> = [
  { path: '/app/sim/orchestration', name: 'ia2.simOrchestration' },
  { path: '/app/sim/settings', name: 'ia2.simSettings' },
  { path: '/app/sim/director/:runId', name: 'ia2.simDirectorRun' },
]

function makeResolveRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes: buildIaRoutes() })
}

/** 实走导航用：全树组件换桩（重定向链不装载真实视图） */
function makeStubbedRouter(): Router {
  const Stub = { template: '<div />' }
  const stub = (records: RouteRecordRaw[]): RouteRecordRaw[] =>
    records.map(r => {
      const copy: Record<string, unknown> = { ...r }
      if (copy.component) copy.component = Stub
      if (Array.isArray(copy.children)) copy.children = stub(copy.children as RouteRecordRaw[])
      return copy as unknown as RouteRecordRaw
    })
  return createRouter({ history: createMemoryHistory(), routes: stub(buildIaRoutes()) })
}

/** 壳渲染用：四签兄弟路由 + 两个专区动作路由（动作页用桩，壳直接作根挂载） */
function makeSimRouter(): Router {
  const ActionStub = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      ...SIM_PATHS.map(({ path, name }) => ({ path, name, component: SimCenterView })),
      ...SIM_ACTION_PATHS.map(({ path, name }) => ({ path, name, component: ActionStub })),
    ],
  })
}

describe('全流程推演壳：四签路由', () => {
  it('四签路由可达，名称与路径冻结一致', () => {
    const router = makeResolveRouter()
    for (const { path, name } of SIM_PATHS) {
      const resolved = router.resolve(path)
      expect(resolved.name, `${path} 应解析为 ${name}`).toBe(name)
      expect(resolved.matched[0]?.name).toBe('ia2.shell')
      expect(resolved.meta.fullscreen, `${path} 继承 /app 壳 fullscreen`).toBe(true)
    }
  })

  it('四签兄弟路由懒组件统一落 SimCenterView', async () => {
    const router = makeResolveRouter()
    for (const { path } of SIM_PATHS) {
      const record = router.resolve(path).matched.slice(-1)[0]
      const loader = record?.components?.default as unknown as () => Promise<{ default: unknown }>
      expect(typeof loader, `${path} loader`).toBe('function')
      const mod = await loader()
      expect(mod.default, `${path} 应落 SimCenterView`).toBe(SimCenterView)
    }
  })

  it('交付健康/需求追溯旧深链 redirect 到⑤验收对应页签', async () => {
    const router = makeResolveRouter()
    for (const [path, tab] of [['/app/sim/delivery', 'delivery'], ['/app/sim/trace', 'trace']] as const) {
      const record = router.resolve(path).matched.slice(-1)[0]
      expect(record?.components, `${path} 组件应退役`).toBeFalsy()
      expect(typeof record?.redirect, `${path} 须为函数式重定向`).toBe('function')
    }
    const stubbed = makeStubbedRouter()
    await stubbed.push('/app/sim/delivery?run=r1')
    expect(stubbed.currentRoute.value.name).toBe('ia2.stage5')
    expect(stubbed.currentRoute.value.query).toMatchObject({ run: 'r1', tab: 'delivery' })
    await stubbed.push('/app/sim/trace?run=r2')
    expect(stubbed.currentRoute.value.name).toBe('ia2.stage5')
    expect(stubbed.currentRoute.value.query).toMatchObject({ run: 'r2', tab: 'trace' })
  })
})

describe('全流程推演壳：/app/runs 家族（列表退役 / 详情恢复）', () => {
  // 2026-10-31 恢复轮（用户裁决）：/app/runs 列表维持重定向 → /app/sim；
  // /app/runs/:runId 恢复为图 run 详情实体路由（RunDetailView），不再改道 /app/sim?run=
  it('runs → /app/sim；runs/:runId 落图 run 详情实体路由', async () => {
    const router = makeStubbedRouter()
    await router.push('/app/runs')
    expect(router.currentRoute.value.fullPath).toBe('/app/sim')
    expect(router.currentRoute.value.name).toBe('ia2.sim')
    await router.push('/app/runs/run-abc')
    expect(router.currentRoute.value.name).toBe('ia2.runDetail')
    expect(router.currentRoute.value.params.runId).toBe('run-abc')
  })

  it('按名跳：ia2.runs 落全流程推演；ia2.runDetail 落详情（既有调用面零改动）', async () => {
    const router = makeStubbedRouter()
    await router.push({ name: 'ia2.runs', query: { tab: 'runs' } })
    expect(router.currentRoute.value.name).toBe('ia2.sim')
    expect(router.currentRoute.value.path).toBe('/app/sim')
    await router.push({ name: 'ia2.runDetail', params: { runId: 'r1' } })
    expect(router.currentRoute.value.name).toBe('ia2.runDetail')
    expect(router.currentRoute.value.params.runId).toBe('r1')
  })

  it('runs 记录只剩重定向；runDetail 有组件装载、runId 参数解析不炸', async () => {
    const router = makeResolveRouter()
    const runsRec = router.resolve('/app/runs').matched.slice(-1)[0]
    expect(runsRec?.components, '/app/runs 组件应退役').toBeFalsy()
    expect(typeof runsRec?.redirect, '/app/runs 须为函数式重定向').toBe('function')
    const detailRec = router.resolve('/app/runs/run-9').matched.slice(-1)[0]
    expect(detailRec?.redirect, '/app/runs/:runId 不得再是重定向').toBeFalsy()
    expect(typeof detailRec?.components?.default).toBe('function')
    expect(router.resolve('/app/runs/run-9').params.runId).toBe('run-9')
  })
})

describe('全流程推演壳：渲染', () => {
  it('中央页签条已退役（2026-10-27 Task 9 与左栏去重）；无二级页签行', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router], stubs } })
    expect(wrapper.findAll('[role="tab"]').length).toBe(0)
    expect(wrapper.find('.sim-center__tabs').exists()).toBe(false)
    wrapper.unmount()
  })

  it('页头签名=当前面板名，文案出 sim-tabs 词表（单一事实源继续被消费）', async () => {
    const router = makeSimRouter()
    const cases = [
      { path: '/app/sim', label: FOUR_TAB_LABELS[0] },
      { path: '/app/sim/supervision', label: FOUR_TAB_LABELS[1] },
      { path: '/app/sim/ops', label: FOUR_TAB_LABELS[2] },
      { path: '/app/sim/evidence', label: FOUR_TAB_LABELS[3] },
    ] as const
    for (const { path, label } of cases) {
      await router.push(path)
      const wrapper = mount(SimCenterView, { global: { plugins: [router], stubs } })
      expect(wrapper.find('.sim-center__title').text(), path).toContain(label)
      wrapper.unmount()
    }
  })

  it('默认签=导演台；页头不再有编排/设置重复按钮（2026-10-21 双入口收敛）', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router], stubs } })
    // 入口唯一=左侧栏：页头两个动作按钮已删
    expect(wrapper.find('[data-testid="ia-sim-action-orchestration"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ia-sim-action-settings"]').exists()).toBe(false)
    const panel = wrapper.find('[data-testid="ia-sim-panel-overview"]')
    expect(panel.exists()).toBe(true)
    expect(visible(panel)).toBe(true)
    expect(panel.find('[data-testid="director-panel"]').exists()).toBe(true)
    expect(panel.find('[data-testid="director-graph-boundary"]').text()).toContain('Matrix')
    expect(wrapper.text()).not.toContain('签 1')
    expect(wrapper.text()).not.toContain('待实现')
    wrapper.unmount()
  })

  it('四签实际数据面都在位（v-show 挂载）', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router], stubs } })
    const live: ReadonlyArray<{ key: string; panel: string }> = [
      { key: 'overview', panel: '[data-testid="director-panel"]' },
      { key: 'supervision', panel: '[data-testid="sup-panel"]' },
      { key: 'ops', panel: '[data-testid="ops-panel"]' },
      { key: 'evidence', panel: '[data-testid="ev-panel"]' },
    ]
    for (const { key, panel } of live) {
      const section = wrapper.find(`[data-testid="ia-sim-panel-${key}"]`)
      expect(section.exists(), `面板 ${key}`).toBe(true)
      expect(section.find(panel).exists(), `数据面 ${key}`).toBe(true)
    }
    // 已迁⑤验收的两签不再在本页渲染
    expect(wrapper.find('[data-testid="ia-sim-panel-delivery"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ia-sim-panel-trace"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('换签=路由切换（左栏承接），面板跟随路由', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router], stubs } })
    await router.push('/app/sim/ops')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/app/sim/ops')
    expect(visible(wrapper.find('[data-testid="ia-sim-panel-ops"]'))).toBe(true)
    expect(visible(wrapper.find('[data-testid="ia-sim-panel-overview"]'))).toBe(false)
    wrapper.unmount()
  })

  it('两体系分流：导演 run 下 legacy 三签显式内联态，不再静默改道', async () => {
    simRunState.value = 'run-sim-director-mvgar1sm-f7fv-1'
    const router = makeSimRouter()
    await router.push('/app/sim/supervision')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router], stubs } })
    // 不自动改道：仍停在监督签
    expect(router.currentRoute.value.name).toBe('ia2.simSupervision')
    expect(wrapper.find('[data-testid="ia-sim-runsplit-supervision"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('不适用')
    // 点击「打开导演详情」→ ia2.simDirectorRun 且带 runId 参数（深链可分享）
    await wrapper.find('[data-testid="ia-sim-runsplit-open"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.simDirectorRun')
    expect(router.currentRoute.value.params.runId).toBe('run-sim-director-mvgar1sm-f7fv-1')
    wrapper.unmount()
    simRunState.value = 'p2-verify-20261019'
  })

  it('非导演 run：legacy 三签照常渲染原面板（无内联态）', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim/supervision')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router], stubs } })
    expect(wrapper.find('[data-testid="ia-sim-runsplit-supervision"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('ia2.simSupervision')
    wrapper.unmount()
  })

  it('旧 ?tab=orchestration|settings 深链在渲染前重定向到唯一 URL', async () => {
    const router = makeStubbedRouter()
    await router.push('/app/sim?tab=orchestration&run=r1&from=3')
    expect(router.currentRoute.value.name).toBe('ia2.simOrchestration')
    expect(router.currentRoute.value.query).toMatchObject({ run: 'r1', from: '3' })
    await router.push('/app/sim?tab=settings&run=r2')
    expect(router.currentRoute.value.name).toBe('ia2.simSettings')
    expect(router.currentRoute.value.query).toMatchObject({ run: 'r2' })
  })

  it('回归守门：SimCenterView 不再内嵌任务协同图/设置页/页头动作按钮；路由守卫在位', () => {
    const src = readFileSync(resolve(__dirname, '../views/sim/SimCenterView.vue'), 'utf8')
    expect(src).not.toContain('views/orchestration/OrchestrationView')
    expect(src).not.toContain('SimSettingsView')
    expect(src).not.toContain('ia-sim-action-')
    const routes = readFileSync(resolve(__dirname, '../routes.ts'), 'utf8')
    expect(routes).toContain('beforeEnter: simLegacyTabGuard')
    expect(routes).toContain("name: 'ia2.notFound'")
    expect(routes).toContain("name: 'ia2.simDirectorRun'")
  })

  it('深链直落各签：/app/sim/evidence 打开即证据库激活', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim/evidence')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router], stubs } })
    expect(visible(wrapper.find('[data-testid="ia-sim-panel-evidence"]'))).toBe(true)
    expect(wrapper.find('[data-testid="ia-sim-panel-evidence"]').find('[data-testid="ev-panel"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('sim-tabs 文案单一事实源', () => {
  it('zh/en 键成对（防半边漂移）', () => {
    expect(Object.keys(SIM_TABS_TEXT.zh)).toEqual(Object.keys(SIM_TABS_TEXT.en))
  })

  it('四签 zh 文案与词表一致；交付/追溯死词条清退', () => {
    const zh = SIM_TABS_TEXT.zh
    expect([zh.tabOverview, zh.tabSupervision, zh.tabOps, zh.tabEvidence]).toEqual([...FOUR_TAB_LABELS])
    expect(zh.shellTitle).toBe('全流程推演')
    expect(zh).not.toHaveProperty('tabDelivery')
    expect(zh).not.toHaveProperty('tabTrace')
  })
})

describe('壳收敛 ia-center-full（V1）', () => {
  it('SimCenterView 挂载加 body 类、卸载移除；隐藏规则在 ia2.scss', async () => {
    const { default: SimCenterView } = await import('../views/sim/SimCenterView.vue')
    const { createRouter, createMemoryHistory } = await import('vue-router')
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/sim', name: 'ia2.sim', component: SimCenterView }] })
    await router.push('/app/sim')
    await router.isReady()
    const w = mount(SimCenterView, { global: { plugins: [router], stubs } })
    expect(document.body.classList.contains('ia-center-full')).toBe(true)
    w.unmount()
    expect(document.body.classList.contains('ia-center-full')).toBe(false)
    const scss = readFileSync(resolve(__dirname, '../styles/shell-overrides.scss'), 'utf8')
    expect(scss).toContain('.studio-navigation-rail')
    expect(scss).toContain('display: none !important')
  })
})
