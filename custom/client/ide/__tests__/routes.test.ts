// overlay/custom/client/ide/__tests__/routes.test.ts
// /ide 路由守门：存在性 / fullscreen meta / 注册开关语义。
// 纯路由表断言用 router.resolve，不加载任何视图组件（懒组件保持函数态）。
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { buildIdeRoutes } from '../routes'

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: buildIdeRoutes() })
}

describe('ide 路由（/ide 主页面）', () => {
  it('/ide 可解析为 ide.shell', () => {
    const router = makeRouter()
    const resolved = router.resolve('/ide')
    expect(resolved.name).toBe('ide.shell')
  })

  it('带 fullscreen meta（隐藏上游 AppSidebar，IDE 自带壳）', () => {
    const router = makeRouter()
    const resolved = router.resolve('/ide')
    expect(resolved.meta.fullscreen).toBe(true)
  })

  it('懒组件保持函数态（不触发视图加载）', () => {
    const [route] = buildIdeRoutes()
    const loader = route.component as unknown as () => Promise<unknown>
    expect(typeof loader).toBe('function')
  })

  it('路由树只含 /ide 一条（子功能不扩路由）', () => {
    expect(buildIdeRoutes()).toHaveLength(1)
    expect(buildIdeRoutes()[0].path).toBe('/ide')
  })
})
