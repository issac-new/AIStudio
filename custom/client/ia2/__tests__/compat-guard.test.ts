// overlay/custom/client/ia2/__tests__/compat-guard.test.ts
// P3 Task 3 — 兼容重定向守卫：旧落点 → 新 IA；VITE_IA_RETRO=1 时 loop 旧落点放行。
// 2026-09-18 统一导航重构（spec 决策 #3：旧路由直删、不保留 redirect）：
// cockpit 家族（cockpit/matrix-chat/swarm-kanban）与 /hermes/loop 壳路由已直删，
// 原「P4 平行共存放行」断言随之退役——守卫只剩 loop 旧深链承接（Task 5 整文件退役）。
// 覆盖链：旧运行中心、旧 loop 详情、RETRO 回退保险、冷深链竞态补查。
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { iaCompatRedirect, installIaCompatGuard, applyColdStartRedirect } from '../guard'

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/hermes/loop/runs', name: 'hermes.loopRuns', component: { template: '<div old-runs />' } },
      { path: '/hermes/loop/:id', name: 'hermes.loopDetail', component: { template: '<div old-loop />' } },
      { path: '/app', name: 'ia2.shell', component: { template: '<div shell />' },
        children: [
          { path: '', name: 'ia2.overview', component: { template: '<div overview />' } },
          { path: 'runs', name: 'ia2.runs', component: { template: '<div runs />' } },
          { path: 'tasks', name: 'ia2.tasks', component: { template: '<div tasks />' } },
        ] },
    ],
  })
}

function stubRouter(retro: boolean): Router {
  const router = makeRouter()
  installIaCompatGuard(router, retro)
  return router
}

describe('iaCompatRedirect（纯函数）—— 名称级承接', () => {
  it('默认模式：旧运行中心 → /app/runs', () => {
    expect(iaCompatRedirect({ name: 'hermes.loopRuns' }, false)).toEqual({ name: 'ia2.runs' })
  })

  it('默认模式：旧 loop 详情 → /app/runs?loop=:id', () => {
    expect(iaCompatRedirect({ name: 'hermes.loopDetail', params: { id: '42' } }, false))
      .toEqual({ name: 'ia2.runs', query: { loop: '42' } })
  })

  it('默认模式：新 IA 与无关路由放行（null）', () => {
    expect(iaCompatRedirect({ name: 'ia2.runs' }, false)).toBeNull()
    expect(iaCompatRedirect({ name: 'hermes.loop' }, false)).toBeNull()
    expect(iaCompatRedirect({ name: 'hermes.loopRunDetail' }, false)).toBeNull()
    expect(iaCompatRedirect({ name: undefined }, false)).toBeNull()
  })

  it('RETRO 模式：loop 旧落点放行（回退保险）', () => {
    expect(iaCompatRedirect({ name: 'hermes.loopRuns' }, true)).toBeNull()
    expect(iaCompatRedirect({ name: 'hermes.loopDetail', params: { id: '42' } }, true)).toBeNull()
  })

  it('路径级导航不改写（守卫只按路由名承接）', () => {
    expect(iaCompatRedirect({ path: '/hermes/loop/runs' }, false)).toBeNull()
    expect(iaCompatRedirect({ path: '/app/runs' }, false)).toBeNull()
    expect(iaCompatRedirect({ path: '/hermes/unknown' }, false)).toBeNull()
  })
})

describe('installIaCompatGuard（真路由集成）', () => {
  it('默认模式：/hermes/loop/runs → /app/runs', async () => {
    const router = stubRouter(false)
    await router.push('/hermes/loop/runs')
    expect(router.currentRoute.value.name).toBe('ia2.runs')
  })

  it('默认模式：/hermes/loop/42 → /app/runs?loop=42', async () => {
    const router = stubRouter(false)
    await router.push('/hermes/loop/42')
    expect(router.currentRoute.value.name).toBe('ia2.runs')
    expect(router.currentRoute.value.query.loop).toBe('42')
  })

  it('RETRO 模式：loop 旧路由原样可用（回退保险）', async () => {
    const router = stubRouter(true)
    await router.push('/hermes/loop/42')
    expect(router.currentRoute.value.name).toBe('hermes.loopDetail')
    expect(router.currentRoute.value.params.id).toBe('42')
  })
})

describe('applyColdStartRedirect（冷深链竞态，审查 C-2）', () => {
  it('旧 loop 深链冷启动被补查（?loop= 保真）', async () => {
    // 复刻生产竞态：app.use(router) 启动初始导航 → 守卫（bootstrap 内）尚未注册 →
    // 已登录深链在旧路由上完成导航（matched.length>0，no-match 兜底不救）
    const router = makeRouter()
    await router.push('/hermes/loop/42')
    expect(router.currentRoute.value.name).toBe('hermes.loopDetail')
    // bootstrap 此刻才装守卫 + 新路由已 addRoute → isReady 后补查
    installIaCompatGuard(router, false)
    await applyColdStartRedirect(router, false)
    expect(router.currentRoute.value.name).toBe('ia2.runs')
    expect(router.currentRoute.value.query.loop).toBe('42')
  })

  it('RETRO 下补查不迁移 loop 旧落点（回退保险）', async () => {
    const router = makeRouter()
    await router.push('/hermes/loop/42')
    installIaCompatGuard(router, true)
    await applyColdStartRedirect(router, true)
    expect(router.currentRoute.value.name).toBe('hermes.loopDetail')
  })

  it('当前已在 /app/runs 时补查为 no-op', async () => {
    const router = makeRouter()
    await router.push('/app/runs')
    installIaCompatGuard(router, false)
    await applyColdStartRedirect(router, false)
    expect(router.currentRoute.value.name).toBe('ia2.runs')
  })
})
