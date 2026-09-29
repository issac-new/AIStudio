// overlay/custom/client/ide/__tests__/routes.test.ts
// IDE 路由守门：存在性 / fullscreen meta / 注册开关语义 / 旧链兼容重定向。
// 纯路由表断言用 router.resolve，不加载任何视图组件（懒组件保持函数态）。
// V5 补遗⑤ M2：主页面归一 /app/ide（驾驶舱子页面，UI 不出 /app 树）；
// /ide 为兼容重定向（任务深链/书签保真）。
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { buildIdeRoutes } from '../routes'

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: buildIdeRoutes() })
}

describe('ide 路由（/app/ide 主页面，⑤ M2 归一）', () => {
  it('/app/ide 可解析为 ide.shell', () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/ide')
    expect(resolved.name).toBe('ide.shell')
  })

  it('带 fullscreen meta（隐藏上游 AppSidebar，IDE 自带壳）', () => {
    const router = makeRouter()
    const resolved = router.resolve('/app/ide')
    expect(resolved.meta.fullscreen).toBe(true)
  })

  it('懒组件保持函数态（不触发视图加载）', () => {
    const [route] = buildIdeRoutes()
    const loader = route.component as unknown as () => Promise<unknown>
    expect(typeof loader).toBe('function')
  })

  it('主页面一条+旧 /ide 兼容重定向两条（子功能不扩路由）', () => {
    const routes = buildIdeRoutes()
    expect(routes).toHaveLength(3)
    expect(routes[0].path).toBe('/app/ide')
    expect(routes[1]).toMatchObject({ path: '/ide', redirect: '/app/ide' })
    expect(routes[2].path).toBe('/ide/:rest(.*)')
  })
})
