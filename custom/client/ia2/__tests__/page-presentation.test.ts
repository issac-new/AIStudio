// @vitest-environment jsdom
// 页面呈现解析器守门（Task 8 阶段页签与页面呈现解析合一）：
//   1) 解析器覆盖既有回落链（推演/常用/工作台兄弟/阶段·页签/岛屿）——recentTitle
//      语义零漂移（等价断言直接对 recent-trail 守门用例）；
//   2) 补缺口：simMap 业务地图、导演详情、query.from 来路阶段进入解析面；
//   3) document.title：页面级标题随路由变，对象级标题路由（IDE/Matrix 会话）
//      让位不覆盖，且对组件卸载时的标题复位免疫（afterEach 后次拍写入）。
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick, onUnmounted } from 'vue'
import { createRouter, createMemoryHistory, RouterView, type Router, type RouteRecordRaw } from 'vue-router'
import {
  resolvePagePresentation,
  pageTitle,
  installPageTitle,
  PRODUCT_TITLE,
  OBJECT_TITLED_ROUTE_NAMES,
} from '../page-presentation'
import { recentTitle } from '../recent-trail'

const r = (name: unknown, fullPath: string, query?: Record<string, unknown>, params?: Record<string, unknown>) =>
  ({ fullPath, path: fullPath, name, query, params })

describe('pageTitle — 既有回落链等价（与 recentTitle 同源同输出）', () => {
  it('推演/常用/工作台兄弟/岛屿/未知回落的输出与 recentTitle 完全一致', () => {
    const cases: Array<[unknown, string]> = [
      [r('ia2.sim', '/app/sim'), r('ia2.simSettings', '/app/sim/settings')],
      [r('ia2.journey', '/app'), r('ia2.board', '/app/board')],
      [r('ia2.collabChat', '/app/s/chat/x'), r('ia2.dash', '/app/dash')],
      [r('ia2.bpa', '/app/bpa'), r('ide.shell', '/app/ide')],
      [r('ia2.unknown', '/app/wherever'), r(undefined, '/app/nowhere')],
    ].flat()
    for (const route of cases) {
      for (const locale of ['zh', 'en'] as const) {
        expect(pageTitle(route, locale), `${String(route.name)} ${locale}`).toBe(recentTitle(route, locale))
      }
    }
  })

  it('阶段页：?tab= 命中页签拼「阶段 · 页签」，未知/缺失不拼', () => {
    expect(pageTitle(r('ia2.stage3', '/app/stage/design'), 'zh')).toBe('分析设计')
    expect(pageTitle(r('ia2.stage3', '/app/stage/design', { tab: 'tasks' }), 'zh')).toBe('分析设计 · 任务分解')
    expect(pageTitle(r('ia2.stage4', '/app/stage/build', { tab: 'board' }), 'zh')).toBe('开发 · 看板')
    expect(pageTitle(r('ia2.stage1', '/app/stage/setup', { tab: 'assets' }), 'en')).toBe('Setup · Environment & assets')
    expect(pageTitle(r('ia2.stage3', '/app/stage/design', { tab: 'nope' }), 'zh')).toBe('分析设计')
  })
})

describe('解析缺口补齐（Task 8 面包屑缺口三件套）', () => {
  it('simMap 业务地图：推演域根 + 子页段，标题自 SIM_NAVS 同源', () => {
    const zh = resolvePagePresentation(r('ia2.simMap', '/app/sim/map'), 'zh')
    expect(zh.root?.label).toBe('全流程推演')
    expect(zh.root?.to).toEqual({ name: 'ia2.sim' })
    expect(zh.simPage?.label).toBe('业务地图')
    expect(zh.attribution).toBeNull()
    expect(zh.stage).toBeNull()
    const en = resolvePagePresentation(r('ia2.simMap', '/app/sim/map'), 'en')
    expect(en.simPage?.label).toBe('Business map')
    expect(pageTitle(r('ia2.simMap', '/app/sim/map'), 'zh')).toBe('业务地图')
  })

  it('导演详情：推演域根 + 导演运行详情段（runId 不进标题）', () => {
    const p = resolvePagePresentation(r('ia2.simDirectorRun', '/app/sim/director/run42', undefined, { runId: 'run42' }), 'zh')
    expect(p.root?.label).toBe('全流程推演')
    expect(p.simPage?.label).toBe('导演运行详情')
    expect(p.attribution).toBeNull()
    expect(pageTitle(r('ia2.simDirectorRun', '/app/sim/director/run42', undefined, { runId: 'run42' }), 'en')).toBe('Director run detail')
  })

  it('query.from 来路阶段：工具页归属段以来路单阶段呈现（非法值回落表内归属）', () => {
    const from2 = resolvePagePresentation(r('ia2.board', '/app/board', { from: '2' }), 'zh')
    expect(from2.attribution?.owners).toEqual([2])
    expect(from2.attribution?.fromQuery).toBe(true)
    const noFrom = resolvePagePresentation(r('ia2.board', '/app/board'), 'zh')
    expect(noFrom.attribution?.owners).toEqual([3, 4])
    expect(noFrom.attribution?.fromQuery).toBe(false)
    const badFrom = resolvePagePresentation(r('ia2.board', '/app/board', { from: '9' }), 'zh')
    expect(badFrom.attribution?.owners).toEqual([3, 4])
    // 推演域不吃 from（独立模式，无日常阶段归属）
    const simFrom = resolvePagePresentation(r('ia2.simEvidence', '/app/sim/evidence', { from: '2' }), 'zh')
    expect(simFrom.attribution).toBeNull()
  })

  it('层级结构不抹平：阶段页三段（根/阶段/页签），旧 gov 深链同构', () => {
    const p = resolvePagePresentation(r('ia2.stage2', '/app/stage/reqs'), 'zh')
    expect(p.root?.label).toBe('流程总览')
    expect(p.stage?.label).toBe('② 需求')
    expect(p.tab?.label).toBe('需求与冻结')
    expect(p.page).toBeNull()
    const legacy = resolvePagePresentation(r('ia2.govDocs', '/app/gov/docs'), 'zh')
    expect(legacy.stage?.label).toBe('⑥ 治理')
    expect(legacy.tab?.label).toBe('文档评审')
  })

  it('全程工具与岛屿：归属段如实（空=全程），页面段可用', () => {
    const mp = resolvePagePresentation(r('ia2.modelProviders', '/app/gov/model-providers'), 'zh')
    expect(mp.attribution?.owners).toEqual([])
    expect(mp.page?.label).toBe('模型服务商')
    const bpa = resolvePagePresentation(r('ia2.bpa', '/app/bpa'), 'zh')
    expect(bpa.page?.label).toBe('流程架构')
  })
})

describe('installPageTitle — 浏览器标签页标题随路由变', () => {
  const View = { template: '<div />' } as never
  /** 对象级标题组件：挂载即写标题、卸载复位（ChatView/MatrixChatPanel 同款行为） */
  const ObjectTitled = defineComponent({
    setup() {
      document.title = 'OBJ - AIStudio'
      onUnmounted(() => { document.title = PRODUCT_TITLE })
      return () => h('div')
    },
  })
  const routes: RouteRecordRaw[] = [
    { path: '/app', name: 'ia2.journey', component: View },
    { path: '/app/stage/reqs', name: 'ia2.stage2', component: View },
    { path: '/app/board', name: 'ia2.board', component: View },
    { path: '/matrix', name: 'matrix.client', component: ObjectTitled },
    { path: '/hermes/session/:sessionId', name: 'hermes.session', component: ObjectTitled },
  ]
  const Host = defineComponent({ setup: () => () => h('div', [h(RouterView)]) })

  function makeRouter(at: string): Router {
    return createRouter({ history: createMemoryHistory(), routes })
  }

  it('对象级标题路由清单包含 IDE 会话与 Matrix 聊天族', () => {
    for (const name of ['hermes.chat', 'hermes.session', 'desktop.chat', 'matrix.client', 'matrix.clientRoom']) {
      expect(OBJECT_TITLED_ROUTE_NAMES.has(name), name).toBe(true)
    }
  })

  it('页面路由写「页面标题 - 产品名」；对象级路由让位不覆盖', async () => {
    document.title = PRODUCT_TITLE
    const router = makeRouter('/app')
    installPageTitle(router, { getLocale: () => 'zh' })
    // 挂 RouterView 宿主：对象级路由上 ObjectTitled 组件真的渲染并自写标题
    const w = mount(Host, { global: { plugins: [router] } })
    await router.push('/app/stage/reqs?tab=g1')
    await nextTick()
    expect(document.title).toBe('需求 · 质量门 G1 - AIStudio')
    await router.push('/app/board')
    await nextTick()
    expect(document.title).toBe('看板 - AIStudio')
    await router.push('/matrix')
    await nextTick()
    // 对象级组件自己写标题；页面级解析不与之争
    expect(document.title).toBe('OBJ - AIStudio')
    w.unmount()
  })

  it('从对象级路由离开：卸载复位不吞掉新页标题（nextTick 后拍写入）', async () => {
    document.title = PRODUCT_TITLE
    const router = createRouter({ history: createMemoryHistory(), routes })
    installPageTitle(router, { getLocale: () => 'zh' })
    const w = mount(Host, { global: { plugins: [router] } })
    await router.push('/matrix')
    await flushPromises()
    expect(document.title).toBe('OBJ - AIStudio')
    await router.push('/app/board')
    await flushPromises()
    await nextTick()
    expect(document.title).toBe('看板 - AIStudio')
    w.unmount()
  })

  it('locale 跟随 getLocale；未知名回落路由名不猜词', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/app/nowhere-known', name: 'ia2.unknown', component: View },
    ] })
    installPageTitle(router, { getLocale: () => 'en' })
    await router.push('/app/nowhere-known')
    await nextTick()
    expect(document.title).toBe('ia2.unknown - AIStudio')
  })
})
