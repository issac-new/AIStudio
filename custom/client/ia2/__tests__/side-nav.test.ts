// @vitest-environment jsdom
// 左侧常驻导航守门（2026-10-18 左侧栏批）：
//   1) 常用/流程/整轮/专题/管理五组共用 IaSideNavItem 一套行式；
//   2) 六阶段只出现在左侧栏（已由 IaShellHeader 移除 IaCentersNav 保证）；
//   3) 当前阶段按页签级归属高亮，阶段状态点来自 useStageProgress；
//   4) 常用入口与专题工作台点击直达既有路由；折叠状态持久化。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))

const progressState = vi.hoisted(() => ({
  run: null as unknown as { value: string },
  stage: {} as Record<number, string>,
}))
vi.mock('../composables/useStageProgress', async () => {
  const { ref } = await import('vue')
  const run = ref('run21')
  progressState.run = run as unknown as { value: string }
  return {
    useStageProgress: () => ({
      run,
      state: ref(null),
      loading: ref(false),
      error: ref(''),
      load: vi.fn(),
      merged: ref({}),
      stageState: (no: number) => progressState.stage[no] ?? 'pending',
      stepState: () => 'pending',
    }),
  }
})

vi.mock('../composables/useDecisionRows', async () => {
  const { ref } = await import('vue')
  return {
    useDecisionRows: () => ({ decisionRows: ref([{ id: 'd1' }, { id: 'd2' }]) }),
  }
})

import IaSideNav from '../components/IaSideNav.vue'

function makeRouter(initial: string): Router {
  const routes: RouteRecordRaw[] = [
    { path: '/app', name: 'ia2.journey', component: { template: '<div />' } },
    { path: '/app/collab', name: 'ia2.collab', component: { template: '<div />' } },
    { path: '/app/board', name: 'ia2.board', component: { template: '<div />' } },
    { path: '/app/inbox', name: 'ia2.inbox', component: { template: '<div />' } },
    { path: '/app/search', name: 'ia2.search', component: { template: '<div />' } },
    { path: '/app/stage/setup', name: 'ia2.stage1', component: { template: '<div />' } },
    { path: '/app/stage/reqs', name: 'ia2.stage2', component: { template: '<div />' } },
    { path: '/app/stage/design', name: 'ia2.stage3', component: { template: '<div />' } },
    { path: '/app/stage/build', name: 'ia2.stage4', component: { template: '<div />' } },
    { path: '/app/stage/accept', name: 'ia2.stage5', component: { template: '<div />' } },
    { path: '/app/stage/govern', name: 'ia2.stage6', component: { template: '<div />' } },
    { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
    { path: '/app/gov/settings', name: 'ia2.govSettings', component: { template: '<div />' } },
    { path: '/app/bpa', name: 'ia2.bpa', component: { template: '<div />' } },
    { path: '/app/ontology', name: 'ia2.ontology', component: { template: '<div />' } },
    { path: '/app/skillgov', name: 'ia2.skillgov', component: { template: '<div />' } },
  ]
  return createRouter({ history: createMemoryHistory(), routes })
}

async function mountAt(path: string) {
  const router = makeRouter(path)
  await router.push(path)
  await router.isReady()
  const w = mount(IaSideNav, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

beforeEach(() => {
  localStorage.clear()
  progressState.run.value = 'run21'
  progressState.stage = { 1: 'done', 2: 'done', 3: 'done', 4: 'current', 5: 'pending', 6: 'pending' }
})

describe('IaSideNav — 左侧常驻导航', () => {
  it('常用组五个入口 + 六阶段 + 整轮 + 专题 + 设置都在位', async () => {
    const { w } = await mountAt('/app/stage/build')
    expect(w.find('[data-testid="ia-side-nav"]').exists()).toBe(true)
    for (const id of ['journey', 'workbench', 'board', 'inbox', 'search']) {
      expect(w.find(`[data-testid="ia-side-nav-${id}"]`).exists(), id).toBe(true)
    }
    for (let n = 1; n <= 6; n++) {
      expect(w.find(`[data-testid="ia-side-nav-stage${n}"]`).exists(), `stage${n}`).toBe(true)
    }
    expect(w.find('[data-testid="ia-side-nav-run"]').exists()).toBe(true)
    expect(w.find('[data-testid="ia-side-nav-settings"]').exists()).toBe(true)
    // 专题按 feature 门控：BPA/本体/技能治理默认开，评测默认关
    expect(w.find('[data-testid="ia-nav-island-bpa"]').exists()).toBe(true)
    expect(w.find('[data-testid="ia-nav-island-ontology"]').exists()).toBe(true)
    w.unmount()
  })

  it('五组子项共用同一行式（.isn-item），流程用数字徽标、常用用图标槽', async () => {
    const { w } = await mountAt('/app/stage/build')
    const rows = w.findAll('.isn-item')
    expect(rows.length).toBeGreaterThanOrEqual(4 + 6 + 1 + 3 + 1)
    // 流程组 6 行使用数字徽标；常用组前导槽不是数字徽标
    expect(w.findAll('.isn-item__lead--number').length).toBe(6)
    expect(w.find('[data-testid="ia-side-nav-board"] .isn-item__lead--number').exists()).toBe(false)
    // 每行都有前导槽、标签、右侧槽三个单元格（同一排列）
    for (const row of rows) {
      expect(row.find('.isn-item__lead').exists()).toBe(true)
      expect(row.find('.isn-item__label').exists()).toBe(true)
      expect(row.find('.isn-item__trail').exists()).toBe(true)
    }
    w.unmount()
  })

  it('当前阶段高亮：④开发 active，其余不高亮；状态点按 stageState 呈现', async () => {
    const { w } = await mountAt('/app/stage/build')
    const stage4 = w.find('[data-testid="ia-side-nav-stage4"]')
    expect(stage4.classes()).toContain('isn-item--active')
    expect(stage4.attributes('aria-current')).toBe('page')
    expect(w.find('[data-testid="ia-side-nav-stage5"]').classes()).not.toContain('isn-item--active')
    expect(stage4.find('.isn-item__status').text()).toBe('●')
    expect(w.find('[data-testid="ia-side-nav-stage1"] .isn-item__status').text()).toBe('✓')
    w.unmount()
  })

  it('常用入口与专题入口点击直达既有路由', async () => {
    const { w, router } = await mountAt('/app/stage/build')
    await w.find('[data-testid="ia-side-nav-board"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.board')

    await w.find('[data-testid="ia-nav-island-bpa"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.bpa')
    w.unmount()
  })

  it('折叠状态持久化：按钮切换后写 user 层，重挂载保持收起', async () => {
    const { w } = await mountAt('/app/stage/build')
    await w.find('[data-testid="ia-side-nav-collapse"]').trigger('click')
    expect(localStorage.getItem('sl:user:sidenav.collapsed')).toBe('true')
    w.unmount()

    const { w: w2 } = await mountAt('/app/stage/build')
    expect(w2.find('[data-testid="ia-side-nav"]').classes()).toContain('isn--collapsed')
    w2.unmount()
  })

  it('旅程页不亮阶段（当前页是总览，不是①搭建）', async () => {
    const { w } = await mountAt('/app')
    const activeStages = w.findAll('.isn-item--active')
    // 只有「流程总览」一个 active；六阶段全部不着色
    expect(activeStages.length).toBe(1)
    expect(activeStages[0].attributes('data-testid')).toBe('ia-side-nav-journey')
    w.unmount()
  })
})
