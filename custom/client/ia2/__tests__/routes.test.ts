// overlay/custom/client/ia2/__tests__/routes.test.ts
// 2026-09-18 统一导航重构（Task 1）：六场景路由树守门——存在性 / 参数原样 /
// fullscreen / 区域投影 / 全树路由名唯一。
// 纯路由表断言用 router.resolve，不加载任何视图组件（懒组件保持函数态）；
// 唯一例外是 runDetail 的懒组件身份断言（stub 替身核对装载目标）。
import { describe, it, expect, vi } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { buildIaRoutes, IA_AREAS, areaForPath } from '../routes'

vi.mock('@/custom/loop/runcenter/views/RunDetailView.vue', () => ({
  default: { template: '<div class="run-detail-stub" />' },
}))
import RunDetailView from '@/custom/loop/runcenter/views/RunDetailView.vue'

function makeRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes: buildIaRoutes() })
}

describe('ia2 路由树（六场景）', () => {
  it('六个场景路径都可解析，路由名 = IA_AREAS 元数据', () => {
    const router = makeRouter()
    for (const area of IA_AREAS) {
      const resolved = router.resolve(area.path)
      // comms 的 'ia2.comms' 挂在 '' 默认子路由上（Task 1 偏差说明见 routes.ts 头注释），
      // 故六场景无一例外：resolve(area.path).name === area.name
      expect(resolved.name, `${area.path} 应可解析`).toBe(area.name)
      expect(String(resolved.name).startsWith('ia2.')).toBe(true)
    }
  })

  it('场景元数据顺序 = 总览/协作/工程/运行/工作项/沟通，i18n key 齐全', () => {
    expect(IA_AREAS.map(a => a.key)).toEqual([
      'overview', 'collab', 'eng', 'ops', 'tasks', 'comms',
    ])
    for (const area of IA_AREAS) {
      expect(area.labelKey).toBe(`ia2.nav.${area.key}`)
    }
  })

  it('/app 默认渲染总览（登录默认落点）', () => {
    const router = makeRouter()
    expect(router.resolve('/app').name).toBe('ia2.overview')
  })

  it('/app/ops/runs/:runId 存在且参数名 runId 原样（对齐 runcenter RunDetailView）', () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/ops/runs/run-abc')
    expect(resolved.name).toBe('ia2.runDetail')
    expect(resolved.params.runId).toBe('run-abc')
  })

  it('/app/ops/runs/:runId 懒组件真实落到 runcenter RunDetailView', async () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/ops/runs/run-abc')
    // matched 末位 = 参数路由记录本体（首位是 /app 壳）
    const record = resolved.matched[resolved.matched.length - 1]
    const loader = record.components?.default as unknown as () => Promise<{ default: unknown }>
    expect(typeof loader).toBe('function')
    const mod = await loader()
    expect(mod.default).toBe(RunDetailView)
  })

  it('comms 承载 matrix-chat 子路由：room/:roomId 路径参数原样', () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/comms/room/!foo:bar')
    expect(resolved.name).toBe('ia2.commsRoom')
    expect(resolved.params.roomId).toBe('!foo:bar')
    // 空路径子路由 = 房间列表（matrix-chat 默认视图），名字即场景名 ia2.comms
    expect(router.resolve('/app/comms').name).toBe('ia2.comms')
  })

  it('协作场景子路由：chat/session/history/global-agent 家族齐全', () => {
    const router = makeRouter()
    expect(router.resolve('/app/collab/chat').name).toBe('ia2.collabChat')
    expect(router.resolve('/app/collab/session/s1').name).toBe('ia2.collabSession')
    expect(router.resolve('/app/collab/history').name).toBe('ia2.collabHistory')
    expect(router.resolve('/app/collab/history/session/s1').name).toBe('ia2.collabHistorySession')
    expect(router.resolve('/app/collab/global-agent').name).toBe('ia2.collabGlobalAgent')
    expect(router.resolve('/app/collab/global-agent/session/s1').name).toBe('ia2.collabGlobalAgentSession')
  })

  it('/app 壳带 fullscreen meta（隐藏上游 AppSidebar）', () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/ops')
    // vue-router meta 按 matched 链合并
    expect(resolved.meta.fullscreen).toBe(true)
  })

  it('路由名全树唯一', () => {
    const names: string[] = []
    const walk = (records: ReturnType<typeof buildIaRoutes>) => {
      for (const r of records) {
        if (r.name) names.push(String(r.name))
        if (r.children) walk(r.children)
      }
    }
    walk(buildIaRoutes())
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('areaForPath（当前场景投影，场景条高亮依据）', () => {
  it.each([
    ['/app', 'overview'],
    ['/app/', 'overview'],
    ['/app/collab', 'collab'],
    ['/app/collab/history', 'collab'],
    ['/app/eng', 'eng'],
    ['/app/ops', 'ops'],
    ['/app/ops/runs/run-9', 'ops'],
    ['/app/tasks', 'tasks'],
    ['/app/comms', 'comms'],
    ['/app/comms/room/x', 'comms'],
  ])('%s → %s', (path, expected) => {
    expect(areaForPath(path)).toBe(expected)
  })

  it('未知 /app 子路径回退总览；非 /app 路径返回 null', () => {
    expect(areaForPath('/app/unknown')).toBe('overview')
    expect(areaForPath('/hermes/cockpit')).toBeNull()
    expect(areaForPath('/ide')).toBeNull()
  })
})
