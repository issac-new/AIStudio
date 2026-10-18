// @vitest-environment jsdom
// 全流程推演专区壳守门（2026-10-18 推演区批，原仿真中心）：
//   1) 四签路由可达：运行总览 / 监督面板 / 运行监控 / 证据库；
//   2) 交付健康/需求追溯已迁⑤验收，旧 /app/sim/* 深链 redirect 到阶段页；
//   3) 默认签=运行总览；页签文案来自 sim-tabs 单一事实源；
//   4) 页面不再渲染「签 N」与「待实现/端点清单」占位；
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

/** 四签文案（zh）：签序即路由序 */
const FOUR_TAB_LABELS = ['运行总览', '监督面板', '运行监控', '证据库'] as const

const SIM_PATHS: ReadonlyArray<{ path: string; name: string }> = [
  { path: '/app/sim', name: 'ia2.sim' },
  { path: '/app/sim/supervision', name: 'ia2.simSupervision' },
  { path: '/app/sim/ops', name: 'ia2.simOps' },
  { path: '/app/sim/evidence', name: 'ia2.simEvidence' },
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

/** 壳渲染用：只挂四签兄弟路由（真实组件直接作根挂载，不经 IaShell） */
function makeSimRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: SIM_PATHS.map(({ path, name }) => ({ path, name, component: SimCenterView })),
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

describe('全流程推演壳：/app/runs 家族重定向', () => {
  it('runs → /app/sim；runs/:runId → /app/sim?run=:runId（runId 原样透传）', async () => {
    const router = makeStubbedRouter()
    await router.push('/app/runs')
    expect(router.currentRoute.value.fullPath).toBe('/app/sim')
    expect(router.currentRoute.value.name).toBe('ia2.sim')
    await router.push('/app/runs/run-abc')
    expect(router.currentRoute.value.fullPath).toBe('/app/sim?run=run-abc')
    expect(router.currentRoute.value.name).toBe('ia2.sim')
  })

  it('按名跳同样落全流程推演（既有调用面零改动）', async () => {
    const router = makeStubbedRouter()
    await router.push({ name: 'ia2.runs', query: { tab: 'runs' } })
    expect(router.currentRoute.value.name).toBe('ia2.sim')
    expect(router.currentRoute.value.path).toBe('/app/sim')
    await router.push({ name: 'ia2.runDetail', params: { runId: 'r1' } })
    expect(router.currentRoute.value.fullPath).toBe('/app/sim?run=r1')
  })

  it('runs 记录只剩重定向：组件零装载、runId 参数解析不炸', async () => {
    const router = makeResolveRouter()
    for (const path of ['/app/runs', '/app/runs/run-9']) {
      const record = router.resolve(path).matched.slice(-1)[0]
      expect(record?.components, `${path} 组件应退役`).toBeFalsy()
      expect(typeof record?.redirect, `${path} 须为函数式重定向`).toBe('function')
    }
    expect(router.resolve('/app/runs/run-9').params.runId).toBe('run-9')
  })
})

describe('全流程推演壳：渲染', () => {
  it('四签单层页签文案=词表；无二级页签行', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router] } })
    const tabs = wrapper.findAll('.sim-center__tab')
    expect(tabs).toHaveLength(4)
    expect(wrapper.findAll('[role="tab"]').length).toBe(4)
    expect(tabs.map(x => x.text())).toEqual([...FOUR_TAB_LABELS])
    wrapper.unmount()
  })

  it('默认签=运行总览；不再渲染「签 N」徽标', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router] } })
    expect(wrapper.find('[data-testid="ia-sim-tab-overview"]').attributes('aria-selected')).toBe('true')
    for (const key of ['supervision', 'ops', 'evidence']) {
      expect(wrapper.find(`[data-testid="ia-sim-tab-${key}"]`).attributes('aria-selected')).toBe('false')
    }
    const panel = wrapper.find('[data-testid="ia-sim-panel-overview"]')
    expect(panel.exists()).toBe(true)
    expect(panel.find('[data-testid="ov-panel"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('签 1')
    expect(wrapper.text()).not.toContain('待实现')
    wrapper.unmount()
  })

  it('四签实际数据面都在位（v-show 挂载）', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router] } })
    const live: ReadonlyArray<{ key: string; panel: string }> = [
      { key: 'overview', panel: '[data-testid="ov-panel"]' },
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

  it('点击页签=路由切换，面板跟随；同签点击不导航', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router] } })
    await wrapper.find('[data-testid="ia-sim-tab-ops"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/app/sim/ops')
    expect(wrapper.find('[data-testid="ia-sim-tab-ops"]').attributes('aria-selected')).toBe('true')
    const before = router.currentRoute.value.fullPath
    await wrapper.find('[data-testid="ia-sim-tab-ops"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(before)
    wrapper.unmount()
  })

  it('深链直落各签：/app/sim/evidence 打开即证据库激活', async () => {
    const router = makeSimRouter()
    await router.push('/app/sim/evidence')
    await router.isReady()
    const wrapper = mount(SimCenterView, { global: { plugins: [router] } })
    expect(wrapper.find('[data-testid="ia-sim-tab-evidence"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('[data-testid="ia-sim-panel-evidence"]').find('[data-testid="ev-panel"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('sim-tabs 文案单一事实源', () => {
  it('zh/en 键成对（防半边漂移）', () => {
    expect(Object.keys(SIM_TABS_TEXT.zh)).toEqual(Object.keys(SIM_TABS_TEXT.en))
  })

  it('四签 zh 文案与词表一致；交付/追溯词条保留兼容', () => {
    const zh = SIM_TABS_TEXT.zh
    expect([zh.tabOverview, zh.tabSupervision, zh.tabOps, zh.tabEvidence]).toEqual([...FOUR_TAB_LABELS])
    expect(zh.shellTitle).toBe('全流程推演')
    expect(zh.tabDelivery).toBe('交付健康')
    expect(zh.tabTrace).toBe('需求追溯')
  })
})

describe('壳收敛 ia-center-full（V1）', () => {
  it('SimCenterView 挂载加 body 类、卸载移除；隐藏规则在 ia2.scss', async () => {
    const { default: SimCenterView } = await import('../views/sim/SimCenterView.vue')
    const { createRouter, createMemoryHistory } = await import('vue-router')
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/sim', name: 'ia2.sim', component: SimCenterView }] })
    await router.push('/app/sim')
    await router.isReady()
    const w = mount(SimCenterView, { global: { plugins: [router] } })
    expect(document.body.classList.contains('ia-center-full')).toBe(true)
    w.unmount()
    expect(document.body.classList.contains('ia-center-full')).toBe(false)
    const scss = readFileSync(resolve(__dirname, '../styles/ia2.scss'), 'utf8')
    expect(scss).toContain('.studio-navigation-rail')
    expect(scss).toContain('display: none !important')
  })
})
