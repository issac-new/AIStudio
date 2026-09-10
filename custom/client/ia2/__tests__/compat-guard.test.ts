// overlay/custom/client/ia2/__tests__/compat-guard.test.ts
// P3 Task 3 — 兼容重定向守卫：旧落点 → 新 IA；VITE_IA_RETRO=1 时 loop 旧落点放行。
// Task 8 — cockpit 退役：/hermes/cockpit、/hermes/matrix-chat(/room/:roomId)、
// /hermes/swarm-kanban 按 PATH 拦截（路由本体已删，任何模式都承接——放行只会落空白）。
// 覆盖链：登录默认（上游 071 守卫把无 redirect 的登录改落 /app）、旧书签深链、
// 旧运行中心、旧 loop 详情。
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { iaCompatRedirect, installIaCompatGuard, applyColdStartRedirect } from '../guard'

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/hermes/cockpit', name: 'hermes.cockpit', component: { template: '<div old-cockpit />' } },
      { path: '/hermes/matrix-chat', name: 'hermes.matrixChat', component: { template: '<div old-matrix />' } },
      { path: '/hermes/matrix-chat/room/:roomId', name: 'hermes.matrixChatRoom', component: { template: '<div old-room />' } },
      { path: '/hermes/swarm-kanban', name: 'hermes.swarmKanban', component: { template: '<div old-kanban />' } },
      { path: '/hermes/loop/runs', name: 'hermes.loopRuns', component: { template: '<div old-runs />' } },
      { path: '/hermes/loop/:id', name: 'hermes.loopDetail', component: { template: '<div old-loop />' } },
      { path: '/app', name: 'ia2.shell', component: { template: '<div shell />' },
        children: [
          { path: '', name: 'ia2.overview', component: { template: '<div overview />' } },
          { path: 'runs', name: 'ia2.runs', component: { template: '<div runs />' } },
          { path: 'tasks', name: 'ia2.tasks', component: { template: '<div tasks />' } },
          { path: 'comms', name: 'ia2.comms', component: { template: '<div comms />' },
            children: [
              { path: '', name: 'ia2.commsHome', component: { template: '<div comms-home />' } },
              { path: 'room/:roomId', name: 'ia2.commsRoom', component: { template: '<div comms-room />' } },
            ] },
        ] },
    ],
  })
}

function stubRouter(retro: boolean): Router {
  const router = makeRouter()
  installIaCompatGuard(router, retro)
  return router
}

describe('iaCompatRedirect（纯函数）—— cockpit 退役路径（Task 8，路径级）', () => {
  it('旧 cockpit 路径 → 总览（旧书签承接；登录默认链现由上游 071 直落 /app）', () => {
    expect(iaCompatRedirect({ path: '/hermes/cockpit' }, false)).toEqual({ name: 'ia2.overview' })
  })

  it('旧 matrix-chat 路径 → /app/comms；房间路径参数原样', () => {
    expect(iaCompatRedirect({ path: '/hermes/matrix-chat' }, false)).toEqual({ name: 'ia2.commsHome' })
    expect(iaCompatRedirect({ path: '/hermes/matrix-chat/room/!foo:bar' }, false))
      .toEqual({ name: 'ia2.commsRoom', params: { roomId: '!foo:bar' } })
  })

  it('旧 swarm-kanban 路径 → 工作项区', () => {
    expect(iaCompatRedirect({ path: '/hermes/swarm-kanban' }, false)).toEqual({ name: 'ia2.tasks' })
  })

  it('退役路径任何模式（含 RETRO）都承接——路由已删，放行即空白', () => {
    expect(iaCompatRedirect({ path: '/hermes/cockpit' }, true)).toEqual({ name: 'ia2.overview' })
    expect(iaCompatRedirect({ path: '/hermes/matrix-chat' }, true)).toEqual({ name: 'ia2.commsHome' })
    expect(iaCompatRedirect({ path: '/hermes/swarm-kanban' }, true)).toEqual({ name: 'ia2.tasks' })
  })

  it('非 /hermes 退役路径不拦（/app 与未知路径放行）', () => {
    expect(iaCompatRedirect({ path: '/app/runs' }, false)).toBeNull()
    expect(iaCompatRedirect({ path: '/hermes/cockpitx' }, false)).toBeNull()
    expect(iaCompatRedirect({ path: '/hermes/matrix-chat2' }, false)).toBeNull()
  })
})

describe('iaCompatRedirect（纯函数）—— 名称级（仍存在路由的承接）', () => {
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

  it('RETRO 模式：loop 旧落点放行（回退保险）', () => {
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

  it('默认模式：matrix-chat 房间深链 → /app/comms/room/:roomId（参数保真）', async () => {
    const router = stubRouter(false)
    await router.push('/hermes/matrix-chat/room/!foo:bar')
    expect(router.currentRoute.value.name).toBe('ia2.commsRoom')
    expect(router.currentRoute.value.params.roomId).toBe('!foo:bar')
  })

  it('默认模式：/hermes/swarm-kanban → /app/tasks；/hermes/loop/runs → /app/runs', async () => {
    const router = stubRouter(false)
    await router.push('/hermes/swarm-kanban')
    expect(router.currentRoute.value.name).toBe('ia2.tasks')
    await router.push('/hermes/loop/runs')
    expect(router.currentRoute.value.name).toBe('ia2.runs')
  })

  it('默认模式：/hermes/loop/42 → /app/runs?loop=42', async () => {
    const router = stubRouter(false)
    await router.push('/hermes/loop/42')
    expect(router.currentRoute.value.name).toBe('ia2.runs')
    expect(router.currentRoute.value.query.loop).toBe('42')
  })

  it('RETRO 模式：loop 旧路由原样可用；退役 cockpit 路径仍承接（路由已删）', async () => {
    const router = stubRouter(true)
    await router.push('/hermes/loop/42')
    expect(router.currentRoute.value.name).toBe('hermes.loopDetail')
    expect(router.currentRoute.value.params.id).toBe('42')
    await router.push('/hermes/cockpit')
    expect(router.currentRoute.value.name).toBe('ia2.overview')
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
