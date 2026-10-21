// @vitest-environment jsdom
// 诚实 404 守门（2026-10-21 遗留清偿）：
//   1) 上游 catch-all 命中的未知路径 → ia2.notFound 且保留 from；
//   2) 已知旧链接 redirect（/hermes/kanban 等）不被守卫劫持；
//   3) 直达 /app 不触发改道；
//   4) NotFoundView 渲染四个出口与原地址。
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'
import { buildIaRoutes, ia2NotFoundGuard, UPSTREAM_CATCH_ALL_PATH } from '../routes'
import NotFoundView from '../views/NotFoundView.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))

const Stub = { template: '<div />' }
function stubbed(records: RouteRecordRaw[]): RouteRecordRaw[] {
  return records.map((r) => {
    const copy: Record<string, unknown> = { ...r }
    if (copy.component) copy.component = Stub
    if (Array.isArray(copy.children)) copy.children = stubbed(copy.children as RouteRecordRaw[])
    return copy as unknown as RouteRecordRaw
  })
}

function makeRouter(): Router {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...stubbed(buildIaRoutes()),
      { path: UPSTREAM_CATCH_ALL_PATH, redirect: '/app' } as RouteRecordRaw,
    ],
  })
  router.beforeEach(ia2NotFoundGuard)
  return router
}

describe('诚实 404：catch-all 改道', () => {
  it('未知 /app 路径 → ia2.notFound 且保留 from', async () => {
    const router = makeRouter()
    await router.push('/app/no-such-page')
    expect(router.currentRoute.value.name).toBe('ia2.notFound')
    expect(router.currentRoute.value.query.from).toBe('/app/no-such-page')
  })

  it('未知顶层路径同样落 notFound', async () => {
    const router = makeRouter()
    await router.push('/totally/unknown')
    expect(router.currentRoute.value.name).toBe('ia2.notFound')
    expect(router.currentRoute.value.query.from).toBe('/totally/unknown')
  })

  it('已知旧链接 redirect 不被劫持：/hermes/kanban → 看板', async () => {
    const router = makeRouter()
    await router.push('/hermes/kanban?x=1')
    expect(router.currentRoute.value.name).toBe('ia2.board')
    expect(router.currentRoute.value.query.x).toBe('1')
  })

  it('直达 /app 不触发改道（旅程页）', async () => {
    const router = makeRouter()
    await router.push('/app')
    expect(router.currentRoute.value.name).toBe('ia2.journey')
  })
})

describe('NotFoundView 渲染', () => {
  it('标题/原地址/四个出口在位', async () => {
    const router = makeRouter()
    await router.push('/app/no-such-page')
    await router.isReady()
    const w = mount(NotFoundView, { global: { plugins: [router] } })
    expect(w.find('[data-testid="ia-not-found"]').exists()).toBe(true)
    expect(w.text()).toContain('页面不存在')
    expect(w.find('[data-testid="ia-not-found-from"]').text()).toContain('/app/no-such-page')
    for (const key of ['overview', 'workbench', 'board', 'search']) {
      expect(w.find(`[data-testid="ia-not-found-go-${key}"]`).exists(), key).toBe(true)
    }
    await w.find('[data-testid="ia-not-found-go-board"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.board')
    w.unmount()
  })
})
