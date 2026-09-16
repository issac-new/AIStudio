// overlay/custom/client/ia2/__tests__/scene-routes.test.ts
// 多视图重构（2026-09-16）：场景子路由构造器守门——双挂载点消费同一构造器防漂移。
// 纯路由表断言（懒组件保持函数态，不加载视图）。
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import {
  buildSceneChildren, IA_SCENES, IA2_SCENE_NAMES, LOOP_SCENE_NAMES, sceneForRouteName,
} from '../routes'
import { buildIaRoutes } from '../routes'
import { buildLoopRoutes } from '@/custom/loop/index'

describe('场景子路由构造器', () => {
  it('四场景：overview 为默认子路由，manage/code/ops 为静态段', () => {
    const children = buildSceneChildren(IA2_SCENE_NAMES)
    expect(children.map(c => c.path)).toEqual(['', 'manage', 'code', 'ops'])
    expect(children.map(c => c.name)).toEqual(['ia2.overview', 'ia2.manage', 'ia2.code', 'ia2.ops'])
    for (const c of children) expect(typeof c.component).toBe('function')
  })

  it('双挂载点名表：/app 家族 ia2.*，/hermes/loop 家族 hermes.loop*', () => {
    expect(buildSceneChildren(LOOP_SCENE_NAMES).map(c => c.name))
      .toEqual(['hermes.loop', 'hermes.loopManage', 'hermes.loopCode', 'hermes.loopOps'])
  })

  it('IA_SCENES 元数据：四场景 i18n key 齐全且与路径同序', () => {
    expect(IA_SCENES.map(s => s.key)).toEqual(['overview', 'manage', 'code', 'ops'])
    for (const s of IA_SCENES) expect(s.labelKey).toBe(`loopCockpit.scene.${s.key}`)
  })

  it('sceneForRouteName 投影两家族；非场景路由返回 null', () => {
    expect(sceneForRouteName('ia2.ops')).toBe('ops')
    expect(sceneForRouteName('hermes.loopCode')).toBe('code')
    expect(sceneForRouteName('hermes.loop')).toBe('overview')
    expect(sceneForRouteName('ia2.runs')).toBeNull()
    expect(sceneForRouteName(undefined)).toBeNull()
  })
})

describe('场景接线（Task 3）', () => {
  it('/app 场景深链可解析，ia2.overview 名称保留在默认子路由', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildIaRoutes() })
    expect(router.resolve('/app').name).toBe('ia2.overview')
    expect(router.resolve('/app/manage').name).toBe('ia2.manage')
    expect(router.resolve('/app/code').name).toBe('ia2.code')
    expect(router.resolve('/app/ops').name).toBe('ia2.ops')
    // 既有兄弟路由不受影响
    expect(router.resolve('/app/runs').name).toBe('ia2.runs')
  })

  it('/hermes/loop 场景深链可解析；静态段排名高于 :id 详情', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildLoopRoutes() })
    expect(router.resolve('/hermes/loop').name).toBe('hermes.loop')
    expect(router.resolve('/hermes/loop/manage').name).toBe('hermes.loopManage')
    expect(router.resolve('/hermes/loop/ops').name).toBe('hermes.loopOps')
    // 静态段不被 :id 吞掉；真 id 仍落详情
    expect(router.resolve('/hermes/loop/abc123').name).toBe('hermes.loopDetail')
    expect(router.resolve('/hermes/loop/runs').name).toBe('hermes.loopRuns')
  })
})
