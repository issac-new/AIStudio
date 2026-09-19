// overlay/custom/client/ia2/__tests__/routes.test.ts
// 2026-09-19 v12 统一视图（Task 2）：双视图路由树守门——存在性 / 参数原样 /
// fullscreen / 视图投影 / 全树路由名唯一。
// 纯路由表断言用 router.resolve，不加载任何视图组件（懒组件保持函数态）；
// 例外是 workbench 与 runDetail 的懒组件身份断言（stub 替身核对装载目标）。
import { describe, it, expect, vi } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { buildIaRoutes, IA_AREAS, areaForPath } from '../routes'

vi.mock('../views/WorkbenchView.vue', () => ({
  default: { template: '<div class="workbench-stub" />' },
}))
vi.mock('@/custom/loop/runcenter/views/RunDetailView.vue', () => ({
  default: { template: '<div class="run-detail-stub" />' },
}))
import WorkbenchView from '../views/WorkbenchView.vue'
import RunDetailView from '@/custom/loop/runcenter/views/RunDetailView.vue'

function makeRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes: buildIaRoutes() })
}

describe('ia2 路由树（v12 双视图）', () => {
  it('场景路径可解析，路由名 = IA_AREAS 元数据', () => {
    const router = makeRouter()
    for (const area of IA_AREAS) {
      const resolved = router.resolve(area.path)
      expect(resolved.name, `${area.path} 应可解析`).toBe(area.name)
      expect(String(resolved.name).startsWith('ia2.')).toBe(true)
    }
  })

  it('场景元数据 = 单视图 collab，i18n key 命名一致', () => {
    expect(IA_AREAS.map(a => a.key)).toEqual(['collab'])
    for (const area of IA_AREAS) {
      expect(area.labelKey).toBe(`ia2.nav.${area.key}`)
    }
  })

  it('/app 默认渲染沟通协作工作台（登录默认落点）', () => {
    const router = makeRouter()
    expect(router.resolve('/app').name).toBe('ia2.collab')
  })

  it('工作台选择子路由：会话/房间/循环 参数名原样', () => {
    const router = makeRouter()
    expect(router.resolve('/app/s/chat').name).toBe('ia2.collabChat')
    const chat = router.resolve('/app/s/chat/sess-1')
    expect(chat.name).toBe('ia2.collabSession')
    expect(chat.params.sessionId).toBe('sess-1')
    const room = router.resolve('/app/s/room/!foo:bar')
    expect(room.name).toBe('ia2.commsRoom')
    expect(room.params.roomId).toBe('!foo:bar')
    const loop = router.resolve('/app/l/lp-1')
    expect(loop.name).toBe('ia2.loopCanvas')
    expect(loop.params.loopId).toBe('lp-1')
  })

  it('工作台记录懒组件真实落到 WorkbenchView', async () => {
    const router = makeRouter()
    for (const path of ['/app', '/app/s/chat/s1', '/app/s/room/r1', '/app/l/l1']) {
      const resolved = router.resolve(path)
      const record = resolved.matched[resolved.matched.length - 1]
      const loader = record.components?.default as unknown as () => Promise<{ default: unknown }>
      expect(typeof loader, `${path} loader`).toBe('function')
      const mod = await loader()
      expect(mod.default).toBe(WorkbenchView)
    }
  })

  it('工作页：board / eng / runs 存在；runDetail 参数名 runId 且懒组件落 RunDetailView', async () => {
    const router = makeRouter()
    expect(router.resolve('/app/board').name).toBe('ia2.board')
    expect(router.resolve('/app/eng').name).toBe('ia2.eng')
    expect(router.resolve('/app/runs').name).toBe('ia2.runs')
    const resolved = router.resolve('/app/runs/run-abc')
    expect(resolved.name).toBe('ia2.runDetail')
    expect(resolved.params.runId).toBe('run-abc')
    const record = resolved.matched[resolved.matched.length - 1]
    const loader = record.components?.default as unknown as () => Promise<{ default: unknown }>
    const mod = await loader()
    expect(mod.default).toBe(RunDetailView)
  })

  it('hermes 会话深链面：history / global-agent 家族齐全（上游 PageSidebarNav 依赖）', () => {
    const router = makeRouter()
    expect(router.resolve('/app/history').name).toBe('ia2.collabHistory')
    expect(router.resolve('/app/history/session/s1').name).toBe('ia2.collabHistorySession')
    expect(router.resolve('/app/agent').name).toBe('ia2.collabGlobalAgent')
    expect(router.resolve('/app/agent/session/s1').name).toBe('ia2.collabGlobalAgentSession')
  })

  it('/app 壳带 fullscreen meta（隐藏上游 AppSidebar）', () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/board')
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

describe('areaForPath（视图投影，场景条高亮依据）', () => {
  it.each([
    ['/app', 'collab'],
    ['/app/', 'collab'],
    ['/app/board', 'collab'],
    ['/app/runs', 'collab'],
    ['/app/runs/run-9', 'collab'],
    ['/app/eng', 'collab'],
    ['/app/s/room/x', 'collab'],
    ['/app/l/lp-1', 'collab'],
    ['/app/history/session/s1', 'collab'],
  ])('%s → %s', (path, expected) => {
    expect(areaForPath(path)).toBe(expected)
  })

  it('非 /app 路径返回 null（IDE 侧 / 上游页）', () => {
    expect(areaForPath('/hermes/cockpit')).toBeNull()
    expect(areaForPath('/ide')).toBeNull()
  })
})
