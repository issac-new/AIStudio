// overlay/custom/client/ia2/__tests__/routes.test.ts
// P3 Task 3 — /app 六区域路由树：存在性 / 默认子路由 / 参数原样搬迁 / fullscreen / 区域投影。
// 纯路由表断言用 router.resolve，不加载任何视图组件（懒组件保持函数态）；
// 唯一例外是 runDetail 的懒组件身份断言（Task 3 台账 Task 9 补：stub 替身核对装载目标）。
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

describe('ia2 路由树（六区域）', () => {
  it('六个区域路径都可解析，路由名前缀 ia2.', () => {
    const router = makeRouter()
    for (const area of IA_AREAS) {
      const resolved = router.resolve(area.path)
      // comms 是带子路由的容器区：/app/comms 落在默认子路由（matrix-chat 房间视图）
      const expected = area.key === 'comms' ? 'ia2.commsHome' : area.name
      expect(resolved.name, `${area.path} 应可解析`).toBe(expected)
      expect(String(resolved.name).startsWith('ia2.')).toBe(true)
    }
  })

  it('区域元数据顺序 = 总览/编排/运行/介入/工作项/沟通，i18n key 齐全', () => {
    expect(IA_AREAS.map(a => a.key)).toEqual([
      'overview', 'orchestrate', 'runs', 'inbox', 'tasks', 'comms',
    ])
    for (const area of IA_AREAS) {
      expect(area.labelKey).toBe(`ia2.nav.${area.key}`)
    }
  })

  it('/app 默认渲染总览（登录默认落点）', () => {
    const router = makeRouter()
    expect(router.resolve('/app').name).toBe('ia2.overview')
  })

  it('/app/runs/:runId 存在且参数名 runId 原样（对齐 runcenter RunDetailView）', () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/runs/run-abc')
    expect(resolved.name).toBe('ia2.runDetail')
    expect(resolved.params.runId).toBe('run-abc')
  })

  it('/app/runs/:runId 懒组件真实落到 runcenter RunDetailView（Task 3 台账 Task 9 补）', async () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/runs/run-abc')
    // matched 末位 = 参数路由记录本体（首位是 /app 壳）
    const record = resolved.matched[resolved.matched.length - 1]
    const loader = record.components?.default as unknown as () => Promise<{ default: unknown }>
    expect(typeof loader).toBe('function')
    const mod = await loader()
    expect(mod.default).toBe(RunDetailView)
  })

  it('comms 吸收 matrix-chat 子路由：room/:roomId 路径参数原样搬迁', () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/comms/room/!foo:bar')
    expect(resolved.name).toBe('ia2.commsRoom')
    expect(resolved.params.roomId).toBe('!foo:bar')
    // 空路径子路由 = 房间列表（matrix-chat 默认视图）
    expect(router.resolve('/app/comms').name).toBe('ia2.commsHome')
  })

  it('/app 壳带 fullscreen meta（隐藏上游 AppSidebar，区域自带 IaNav）', () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/runs')
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

describe('areaForPath（当前区域投影，IaNav 高亮依据）', () => {
  it.each([
    ['/app', 'overview'],
    ['/app/', 'overview'],
    ['/app/orchestrate', 'orchestrate'],
    ['/app/runs', 'runs'],
    ['/app/runs/run-9', 'runs'],
    ['/app/inbox', 'inbox'],
    ['/app/tasks', 'tasks'],
    ['/app/comms', 'comms'],
    ['/app/comms/room/x', 'comms'],
  ])('%s → %s', (path, expected) => {
    expect(areaForPath(path)).toBe(expected)
  })

  it('未知 /app 子路径回退总览；非 /app 路径返回 null', () => {
    expect(areaForPath('/app/unknown')).toBe('overview')
    expect(areaForPath('/hermes/cockpit')).toBeNull()
  })
})
