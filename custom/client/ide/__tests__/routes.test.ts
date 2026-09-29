// overlay/custom/client/ide/__tests__/routes.test.ts
// /ide 兼容重定向守门（补遗⑤ M2 归一后）：
//   路由本体 = ia2/routes.ts 内 IaShell 子路由 /app/ide（名称仍 ide.shell），
//   本文件只产旧直链兼容重定向。纯路由表断言用 router.resolve/push，
//   不加载任何视图组件（懒组件保持函数态）。
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { buildIdeRoutes } from '../routes'

const stubIde = { path: '/app/ide', name: 'ide.shell', component: { render: () => null } }

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [...buildIdeRoutes(), stubIde] })
}

describe('ide 路由（/ide 旧直链兼容重定向）', () => {
  it('buildIdeRoutes 只含 /ide → /app/ide 重定向一条', () => {
    const routes = buildIdeRoutes()
    expect(routes).toHaveLength(1)
    expect(routes[0].path).toBe('/ide')
    expect(routes[0].redirect).toBe('/app/ide')
  })

  it('/ide 导航重定向到 /app/ide 且查询参数透传（?task=/?session= 深链免改）', async () => {
    const router = makeRouter()
    await router.push('/ide?task=t_abc&session=s_1')
    expect(router.currentRoute.value.path).toBe('/app/ide')
    expect(router.currentRoute.value.name).toBe('ide.shell')
    expect(router.currentRoute.value.query.task).toBe('t_abc')
    expect(router.currentRoute.value.query.session).toBe('s_1')
  })

  it('/ide 不再承载组件（独立壳退役，本体在 ia2 子路由）', () => {
    const [route] = buildIdeRoutes() as Array<{ component?: unknown; redirect?: unknown }>
    expect(route.component).toBeUndefined()
    expect(route.redirect).toBe('/app/ide')
  })
})
