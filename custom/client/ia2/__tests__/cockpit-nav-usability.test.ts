// @vitest-environment jsdom
// 2026-10-17 驾驶舱层级/动线/末端可用性批单测：
//   1) 面包屑：阶段页/中心根/中心签级/末端页四种位置感 + 回旅程可点
//   2) run 上下文：query 优先、记忆回落、成功后记忆、跨签 query 刷新
//   3) 导语首访展开：第一次挂载自动展开并记忆，第二次保持收起
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'
import { defineComponent, h } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))

import IaBreadcrumb from '../components/IaBreadcrumb.vue'
import TabIntroBanner from '../components/TabIntroBanner.vue'
import { useRunContext, LAST_RUN_KEY } from '../composables/useRunContext'

function makeRouter(initial: string): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', name: 'ia2.journey', component: { template: '<div />' } },
      { path: '/app/stage/reqs', name: 'ia2.stage2', component: { template: '<div />' } },
      { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
      { path: '/app/sim/supervision', name: 'ia2.simSupervision', component: { template: '<div />' } },
      { path: '/app/gov', name: 'ia2.governance', component: { template: '<div />' } },
      { path: '/app/gov/docs', name: 'ia2.govDocs', component: { template: '<div />' } },
      { path: '/app/gov/model-providers', name: 'ia2.modelProviders', component: { template: '<div />' } },
      { path: '/app/inbox', name: 'ia2.inbox', component: { template: '<div />' } },
    ] as RouteRecordRaw[],
  })
}

async function mountAt(path: string) {
  const router = makeRouter(path)
  await router.push(path)
  await router.isReady()
  const w = mount(IaBreadcrumb, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

describe('IaBreadcrumb — 位置感（层级乱痛点）', () => {
  beforeEach(() => { localStorage.clear() })

  it('旅程页自身不渲染面包屑（首页无需自我指认）', async () => {
    const { w } = await mountAt('/app')
    expect(w.find('[data-testid="ia-breadcrumb"]').exists()).toBe(false)
    w.unmount()
  })

  it('阶段页：旅程＞②需求，当前段带 aria-current', async () => {
    const { w } = await mountAt('/app/stage/reqs')
    const nav = w.find('[data-testid="ia-breadcrumb"]')
    expect(nav.exists()).toBe(true)
    expect(nav.text()).toContain('旅程')
    expect(nav.text()).toContain('② 需求')
    expect(w.find('[data-testid="ia-breadcrumb-current"]').attributes('aria-current')).toBe('page')
    w.unmount()
  })

  it('中心根路径只到中心层，不重复默认签；运行总览标「全程」', async () => {
    const { w } = await mountAt('/app/sim')
    const text = w.find('[data-testid="ia-breadcrumb"]').text()
    expect(text).toContain('仿真中心')
    expect(text).not.toContain('运行总览')
    expect(w.find('[data-testid="ia-breadcrumb-attribution"]').text()).toBe('全程')
    w.unmount()
  })

  it('中心签级：旅程＞③④＞仿真中心＞监督面板（多归属如实列两阶段）', async () => {
    const { w } = await mountAt('/app/sim/supervision')
    const text = w.find('[data-testid="ia-breadcrumb"]').text()
    expect(text).toContain('旅程')
    expect(text).toContain('仿真中心')
    expect(text).toContain('监督面板')
    expect(w.find('[data-testid="ia-breadcrumb-attribution"]').text()).toBe('③④')
    w.unmount()
  })

  it('治理签级：文档评审段取自 gov-tabs 单一事实源，归属②⑤', async () => {
    const { w } = await mountAt('/app/gov/docs')
    const text = w.find('[data-testid="ia-breadcrumb"]').text()
    expect(text).toContain('治理中心')
    expect(text).toContain('文档评审')
    expect(w.find('[data-testid="ia-breadcrumb-attribution"]').text()).toBe('②⑤')
    w.unmount()
  })

  it('全程工具：模型服务商 旅程＞全程＞治理中心＞模型服务商', async () => {
    const { w } = await mountAt('/app/gov/model-providers')
    const text = w.find('[data-testid="ia-breadcrumb"]').text()
    expect(text).toContain('治理中心')
    expect(text).toContain('模型服务商')
    expect(w.find('[data-testid="ia-breadcrumb-attribution"]').text()).toBe('全程')
    w.unmount()
  })

  it('末端页：旅程＞④⑤＞审批收件箱，点旅程回首页', async () => {
    const { w, router } = await mountAt('/app/inbox')
    expect(w.find('[data-testid="ia-breadcrumb"]').text()).toContain('审批收件箱')
    expect(w.find('[data-testid="ia-breadcrumb-attribution"]').text()).toBe('④⑤')
    const links = w.findAll('.ia-bc__link')
    expect(links.length).toBeGreaterThan(0)
    await links[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.journey')
    w.unmount()
  })
})

const RunHost = defineComponent({
  setup() {
    const { run, remember } = useRunContext()
    return () => h('div', [
      h('span', { 'data-testid': 'run-value' }, run.value),
      h('button', { 'data-testid': 'run-remember', onClick: () => remember() }, 'remember'),
    ])
  },
})

async function mountRunHost(path: string) {
  const router = makeRouter(path)
  await router.push(path)
  await router.isReady()
  const w = mount(RunHost, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

describe('useRunContext — run 跨签贯通（往返动线痛点）', () => {
  beforeEach(() => { localStorage.clear() })

  it('query 优先于记忆值', async () => {
    localStorage.setItem(LAST_RUN_KEY, 'stored-run')
    const { w } = await mountRunHost('/app/sim?run=query-run')
    expect(w.find('[data-testid="run-value"]').text()).toBe('query-run')
    w.unmount()
  })

  it('无 query 时回落到最近成功读取的运行', async () => {
    localStorage.setItem(LAST_RUN_KEY, 'stored-run')
    const { w } = await mountRunHost('/app/sim')
    expect(w.find('[data-testid="run-value"]').text()).toBe('stored-run')
    w.unmount()
  })

  it('remember 写入单一记忆键；跨签 query 变化跟随刷新', async () => {
    const { w, router } = await mountRunHost('/app/sim?run=run-a')
    await w.find('[data-testid="run-remember"]').trigger('click')
    expect(localStorage.getItem(LAST_RUN_KEY)).toBe('run-a')
    await router.push('/app/sim?run=run-b')
    await flushPromises()
    expect(w.find('[data-testid="run-value"]').text()).toBe('run-b')
    w.unmount()
  })
})

describe('TabIntroBanner — 导语首访展开（末端页看不懂痛点）', () => {
  beforeEach(() => { localStorage.clear() })

  it('首访自动展开并记忆；再次进入维持收起', async () => {
    const first = mount(TabIntroBanner, { props: { tab: 'inbox' } })
    await flushPromises()
    const details = first.find('details')
    expect(details.exists()).toBe(true)
    expect((details.element as HTMLDetailsElement).open).toBe(true)
    expect(localStorage.getItem('ia2.tabIntroSeen:inbox')).toBe('1')
    first.unmount()

    const second = mount(TabIntroBanner, { props: { tab: 'inbox' } })
    await flushPromises()
    expect((second.find('details').element as HTMLDetailsElement).open).toBe(false)
    second.unmount()
  })

  it('无词条的签不渲染也不写记忆', async () => {
    const w = mount(TabIntroBanner, { props: { tab: 'no-such-tab' } })
    await flushPromises()
    expect(w.find('details').exists()).toBe(false)
    expect(localStorage.getItem('ia2.tabIntroSeen:no-such-tab')).toBeNull()
    w.unmount()
  })
})
