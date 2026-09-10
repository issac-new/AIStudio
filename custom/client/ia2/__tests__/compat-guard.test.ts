// overlay/custom/client/ia2/__tests__/compat-guard.test.ts
// P3 Task 3 — 兼容重定向守卫：旧落点 → 新 IA；VITE_IA_RETRO=1 时全部放行。
// 覆盖三条链：登录默认（上游 071 守卫把无 redirect 的登录落在 hermes.cockpit，
// 本守卫接力改落 /app）、旧运行中心、旧 loop 详情。
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { iaCompatRedirect, installIaCompatGuard, applyColdStartRedirect } from '../guard'

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/hermes/cockpit', name: 'hermes.cockpit', component: { template: '<div old-cockpit />' } },
      { path: '/hermes/loop/runs', name: 'hermes.loopRuns', component: { template: '<div old-runs />' } },
      { path: '/hermes/loop/:id', name: 'hermes.loopDetail', component: { template: '<div old-loop />' } },
      { path: '/app', name: 'ia2.shell', component: { template: '<div shell />' },
        children: [
          { path: '', name: 'ia2.overview', component: { template: '<div overview />' } },
          { path: 'runs', name: 'ia2.runs', component: { template: '<div runs />' } },
        ] },
    ],
  })
}

function stubRouter(retro: boolean): Router {
  const router = makeRouter()
  installIaCompatGuard(router, retro)
  return router
}

describe('iaCompatRedirect（纯函数）', () => {
  it('默认模式：旧 cockpit 落点 → 总览（含登录默认链）', () => {
    expect(iaCompatRedirect({ name: 'hermes.cockpit' }, false)).toEqual({ name: 'ia2.overview' })
  })

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

  it('RETRO 模式：全部放行（回退保险）', () => {
    expect(iaCompatRedirect({ name: 'hermes.cockpit' }, true)).toBeNull()
    expect(iaCompatRedirect({ name: 'hermes.loopRuns' }, true)).toBeNull()
    expect(iaCompatRedirect({ name: 'hermes.loopDetail', params: { id: '42' } }, true)).toBeNull()
  })
})

describe('installIaCompatGuard（真路由集成）', () => {
  it('默认模式：导航 /hermes/cockpit 实际落在 /app 总览', async () => {
    const router = stubRouter(false)
    await router.push('/hermes/cockpit')
    expect(router.currentRoute.value.name).toBe('ia2.overview')
    expect(router.currentRoute.value.path).toBe('/app')
  })

  it('默认模式：/hermes/loop/runs → /app/runs；/hermes/loop/42 → /app/runs?loop=42', async () => {
    const router = stubRouter(false)
    await router.push('/hermes/loop/runs')
    expect(router.currentRoute.value.name).toBe('ia2.runs')
    await router.push('/hermes/loop/42')
    expect(router.currentRoute.value.name).toBe('ia2.runs')
    expect(router.currentRoute.value.query.loop).toBe('42')
  })

  it('RETRO 模式：旧路由原样可用（不重定向）', async () => {
    const router = stubRouter(true)
    await router.push('/hermes/cockpit')
    expect(router.currentRoute.value.name).toBe('hermes.cockpit')
    await router.push('/hermes/loop/42')
    expect(router.currentRoute.value.name).toBe('hermes.loopDetail')
    expect(router.currentRoute.value.params.id).toBe('42')
  })
})

describe('applyColdStartRedirect（冷深链竞态，审查 C-2）', () => {
  it('初始导航（守卫未注册窗口内）定型在旧 cockpit 后，补查改落 /app 总览', async () => {
    // 复刻生产竞态：app.use(router) 启动初始导航 → 守卫（bootstrap 内）尚未注册 →
    // 已登录深链在旧路由上完成导航（matched.length>0，no-match 兜底不救）
    const router = makeRouter()
    await router.push('/hermes/cockpit')
    expect(router.currentRoute.value.name).toBe('hermes.cockpit')
    // bootstrap 此刻才装守卫 + 新路由已 addRoute → isReady 后补查
    installIaCompatGuard(router, false)
    await applyColdStartRedirect(router, false)
    expect(router.currentRoute.value.name).toBe('ia2.overview')
    expect(router.currentRoute.value.path).toBe('/app')
  })

  it('旧 loop 深链冷启动同样被补查（?loop= 保真）', async () => {
    const router = makeRouter()
    await router.push('/hermes/loop/42')
    expect(router.currentRoute.value.name).toBe('hermes.loopDetail')
    installIaCompatGuard(router, false)
    await applyColdStartRedirect(router, false)
    expect(router.currentRoute.value.name).toBe('ia2.runs')
    expect(router.currentRoute.value.query.loop).toBe('42')
  })

  it('RETRO 下补查不迁移（回退保险）', async () => {
    const router = makeRouter()
    await router.push('/hermes/cockpit')
    installIaCompatGuard(router, true)
    await applyColdStartRedirect(router, true)
    expect(router.currentRoute.value.name).toBe('hermes.cockpit')
  })

  it('当前已在 /app/runs 时补查为 no-op', async () => {
    const router = makeRouter()
    await router.push('/app/runs')
    installIaCompatGuard(router, false)
    await applyColdStartRedirect(router, false)
    expect(router.currentRoute.value.name).toBe('ia2.runs')
  })
})
