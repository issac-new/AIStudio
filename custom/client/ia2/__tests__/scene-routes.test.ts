// overlay/custom/client/ia2/__tests__/scene-routes.test.ts
// 路由树守门（2026-09-18 统一导航重构）：六场景树 + 协作子路由 + 旧家族禁入。
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { buildIaRoutes, IA_AREAS, areaForPath } from '../routes'

const Dummy = { template: '<div />' }

function makeRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  // 测试不触发懒加载：把 component 全部替换为 Dummy
  const strip = (rs: any[]): any[] =>
    rs.map(r => ({ ...r, component: r.component ? Dummy : undefined, children: r.children ? strip(r.children) : undefined }))
  for (const r of strip(buildIaRoutes())) router.addRoute(r)
  return router
}

describe('ia2 路由树（六场景）', () => {
  it('IA_AREAS = 总览/协作/工程/运行/工作项/沟通', () => {
    expect(IA_AREAS.map(a => a.key)).toEqual(['overview', 'collab', 'eng', 'ops', 'tasks', 'comms'])
  })

  it.each([
    ['/app', 'ia2.overview'],
    ['/app/collab', 'ia2.collab'],
    ['/app/collab/session/s1', 'ia2.collabSession'],
    ['/app/collab/history', 'ia2.collabHistory'],
    ['/app/collab/global-agent/session/s1', 'ia2.collabGlobalAgentSession'],
    ['/app/eng', 'ia2.eng'],
    ['/app/ops', 'ia2.ops'],
    ['/app/ops/runs/r1', 'ia2.runDetail'],
    ['/app/tasks', 'ia2.tasks'],
    ['/app/comms', 'ia2.comms'],
    ['/app/comms/room/!x:host', 'ia2.commsRoom'],
  ])('%s → %s', (path, name) => {
    const router = makeRouter()
    const resolved = router.resolve(path)
    expect(resolved.name).toBe(name)
    expect(resolved.matched.length).toBeGreaterThan(0)
  })

  it('areaForPath 投影六场景', () => {
    expect(areaForPath('/app')).toBe('overview')
    expect(areaForPath('/app/collab/history')).toBe('collab')
    expect(areaForPath('/app/eng')).toBe('eng')
    expect(areaForPath('/app/ops/runs/r1')).toBe('ops')
    expect(areaForPath('/app/tasks')).toBe('tasks')
    expect(areaForPath('/app/comms/room/!x')).toBe('comms')
    expect(areaForPath('/ide')).toBeNull()
  })

  it('壳 meta.fullscreen = true', () => {
    const shell = buildIaRoutes()[0]
    expect(shell.meta?.fullscreen).toBe(true)
  })
})
