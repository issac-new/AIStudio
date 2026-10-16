// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-center-shell.test.ts
// B1 推演中心壳单测（三中心重构波 2 首件，2026-10-16）：
//   1) 六签路由可达（/app/sim 家族，名称冻结自 2026-10-16-sim-center-detailed-design.md）
//   2) /app/runs 家族重定向（兼容期一个版本周期，A13 升格移除）——按路径跳与
//      按名跳（IaGlobalTop/SpotlightPanel/inbox-center 等既有调用面）同验
//   3) 默认签=轮次总览；六签单层页签文案渲染（zh 冻结词表）；占位面板含
//      签序标题+待实现说明+将消费的 X1 端点名
//   4) sim-tabs 文案模块 zh/en 键成对（单一事实源不半边漂移）
// 路由表断言用 router.resolve（不装载组件）；实走重定向时组件换桩（同
// unified-nav-guard 模式，避免装载 IaShell 重型导入链）。
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'
import { buildIaRoutes } from '../routes'
import SimCenterView from '../views/sim/SimCenterView.vue'
import { SIM_TABS_TEXT } from '../views/sim/sim-tabs'

/** 六签冻结词表（zh）：签序即路由序 */
const SIX_TAB_LABELS = ['轮次总览', '监督面板', '运行观测', '证据库', '交付健康', '需求追溯'] as const

const SIM_PATHS: ReadonlyArray<{ path: string; name: string }> = [
  { path: '/app/sim', name: 'ia2.sim' },
  { path: '/app/sim/supervision', name: 'ia2.simSupervision' },
  { path: '/app/sim/ops', name: 'ia2.simOps' },
  { path: '/app/sim/evidence', name: 'ia2.simEvidence' },
  { path: '/app/sim/delivery', name: 'ia2.simDelivery' },
  { path: '/app/sim/trace', name: 'ia2.simTrace' },
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

/** 壳渲染用：只挂六签兄弟路由（真实组件直接作根挂载，不经 IaShell） */
function makeSimRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: SIM_PATHS.map(({ path, name }) => ({ path, name, component: SimCenterView })),
  })
}

describe('推演中心壳（B1）：六签路由', () => {
  it('六签路由可达，名称与路径冻结一致（详设 §签 1-6 挂面）', () => {
    const router = makeResolveRouter()
    for (const { path, name } of SIM_PATHS) {
      const resolved = router.resolve(path)
      expect(resolved.name, `${path} 应解析为 ${name}`).toBe(name)
      expect(resolved.matched[0]?.name).toBe('ia2.shell')
      expect(resolved.meta.fullscreen, `${path} 继承 /app 壳 fullscreen`).toBe(true)
    }
  })

  it('六签兄弟路由懒组件统一落 SimCenterView（workbench 复用模式）', async () => {
    const router = makeResolveRouter()
    for (const { path } of SIM_PATHS) {
      const record = router.resolve(path).matched.slice(-1)[0]
      const loader = record?.components?.default as unknown as () => Promise<{ default: unknown }>
      expect(typeof loader, `${path} loader`).toBe('function')
      const mod = await loader()
      expect(mod.default, `${path} 应落 SimCenterView`).toBe(SimCenterView)
    }
  })
})

describe('推演中心壳（B1）：/app/runs 家族重定向', () => {
  it('runs → /app/sim；runs/:runId → /app/sim?run=:runId（runId 原样透传）', async () => {
    const router = makeStubbedRouter()
    await router.push('/app/runs')
    expect(router.currentRoute.value.fullPath).toBe('/app/sim')
    expect(router.currentRoute.value.name).toBe('ia2.sim')
    await router.push('/app/runs/run-abc')
    expect(router.currentRoute.value.fullPath).toBe('/app/sim?run=run-abc')
    expect(router.currentRoute.value.name).toBe('ia2.sim')
  })

  it('按名跳同样落推演中心（IaGlobalTop/WorkbenchView/TraceabilityMatrix 等调用面零改动）', async () => {
    const router = makeStubbedRouter()
    // vue-router redirect 语义：原导航 query 并入目标（无消费者、无害）——
    // 断言收敛到落点路由与 path
    await router.push({ name: 'ia2.runs', query: { tab: 'runs' } })
    expect(router.currentRoute.value.name).toBe('ia2.sim')
    expect(router.currentRoute.value.path).toBe('/app/sim')
    await router.push({ name: 'ia2.runDetail', params: { runId: 'r1' } })
    expect(router.currentRoute.value.fullPath).toBe('/app/sim?run=r1')
  })

  it('runs 记录只剩重定向：组件零装载、runId 参数解析不炸（兼容守卫深链不白屏）', async () => {
    const router = makeResolveRouter()
    for (const path of ['/app/runs', '/app/runs/run-9']) {
      const record = router.resolve(path).matched.slice(-1)[0]
      expect(record?.components, `${path} 组件应退役`).toBeFalsy()
      expect(typeof record?.redirect, `${path} 须为函数式重定向`).toBe('function')
    }
    expect(router.resolve('/app/runs/run-9').params.runId).toBe('run-9')
    // B1 明示：runs 家族旧 query（?loop= 预填 / ?tab=runs）无消费者（RunCenter
    // 的 loop 搜索预填随整页退役）；vue-router redirect 会并入目标 URL 但落点
    // 路由不变——轮次定位改走 ?run=（A13 升格承接）
    const router2 = makeStubbedRouter()
    await router2.push('/app/runs?tab=runs&loop=l1')
    expect(router2.currentRoute.value.name).toBe('ia2.sim')
    expect(router2.currentRoute.value.path).toBe('/app/sim')
  })
})

describe('推演中心壳（B1）：渲染', () => {
  it('六签单层页签文案=冻结词表（轮次总览…需求追溯），无二级页签行', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router] } })
    const tabs = wrapper.findAll('.sim-center__tab')
    expect(tabs).toHaveLength(6)
    expect(wrapper.findAll('[role="tab"]').length).toBe(6)
    expect(tabs.map(x => x.text())).toEqual([...SIX_TAB_LABELS])
    wrapper.unmount()
  })

  it('默认签=轮次总览：/app/sim 即签 1 激活 + 占位面板在渲染位', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router] } })
    expect(wrapper.find('[data-testid="ia-sim-tab-overview"]').attributes('aria-selected')).toBe('true')
    for (const key of ['supervision', 'ops', 'evidence', 'delivery', 'trace']) {
      expect(wrapper.find(`[data-testid="ia-sim-tab-${key}"]`).attributes('aria-selected')).toBe('false')
    }
    const panel = wrapper.find('[data-testid="ia-sim-panel-overview"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('签 1·轮次总览')
    expect(panel.text()).toContain('待实现')
    wrapper.unmount()
  })

  it('每签标题在位；占位签注明将消费的 X1 端点，实装签承载实际面板（B2/B4/B5/B6 后五签实装）', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router] } })
    // 唯一占位签=轮次总览（B 波旗舰屏工单待实装）
    const ov = wrapper.find('[data-testid="ia-sim-panel-overview"]')
    expect(ov.exists()).toBe(true)
    expect(ov.text()).toContain('签 1·轮次总览')
    expect(ov.text()).toContain('/api/hermes/sim/run-state')
    // 五签实装：标题保留，占位端点清单由实际数据面取代
    const live: ReadonlyArray<{ key: string; title: string; panel: string }> = [
      { key: 'supervision', title: '签 2·监督面板', panel: '[data-testid="sup-panel"]' },
      { key: 'ops', title: '签 3·运行观测', panel: '[data-testid="ops-panel"]' },
      { key: 'evidence', title: '签 4·证据库', panel: '[data-testid="ev-panel"]' },
      { key: 'delivery', title: '签 5·交付健康', panel: '[data-testid="dlv-panel"]' },
      { key: 'trace', title: '签 6·需求追溯', panel: '[data-testid="trc-panel"]' },
    ]
    for (const { key, title, panel } of live) {
      const section = wrapper.find(`[data-testid="ia-sim-panel-${key}"]`)
      expect(section.exists(), `实装面板 ${key}`).toBe(true)
      expect(section.text()).toContain(title)
      expect(section.find(panel).exists(), `实际数据面 ${key}`).toBe(true)
    }
    wrapper.unmount()
  })

  it('点击页签=路由切换（页签位置可分享/刷新保持），面板跟随', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router] } })
    await wrapper.find('[data-testid="ia-sim-tab-ops"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/app/sim/ops')
    expect(wrapper.find('[data-testid="ia-sim-tab-ops"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.text()).toContain('签 3·运行观测')
    // 同签点击不产生导航（当前签守卫）
    const before = router.currentRoute.value.fullPath
    await wrapper.find('[data-testid="ia-sim-tab-ops"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(before)
    wrapper.unmount()
  })

  it('深链直落各签：/app/sim/evidence 打开即签 4 激活', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim/evidence')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router] } })
    expect(wrapper.find('[data-testid="ia-sim-tab-evidence"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('[data-testid="ia-sim-panel-evidence"]').text()).toContain('签 4·证据库')
    wrapper.unmount()
  })
})

describe('sim-tabs 文案单一事实源', () => {
  it('zh/en 键成对（防半边漂移）', () => {
    expect(Object.keys(SIM_TABS_TEXT.zh)).toEqual(Object.keys(SIM_TABS_TEXT.en))
  })

  it('六签 zh 文案与冻结词表一致', () => {
    const zh = SIM_TABS_TEXT.zh
    expect([zh.tabOverview, zh.tabSupervision, zh.tabOps, zh.tabEvidence, zh.tabDelivery, zh.tabTrace])
      .toEqual([...SIX_TAB_LABELS])
  })
})
