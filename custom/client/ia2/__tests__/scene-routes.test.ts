// overlay/custom/client/ia2/__tests__/scene-routes.test.ts
// 多视图重构（2026-09-16）：场景子路由构造器守门——双挂载点消费同一构造器防漂移。
// 纯路由表断言（懒组件保持函数态，不加载视图）。
import { describe, it, expect } from 'vitest'
import {
  buildSceneChildren, IA_SCENES, IA2_SCENE_NAMES, LOOP_SCENE_NAMES, sceneForRouteName,
} from '../routes'

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
