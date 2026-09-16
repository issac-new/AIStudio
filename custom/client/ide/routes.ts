// overlay/custom/client/ide/routes.ts
// IDE 工作台主页面路由（/ide）—— 纯路由描述，零上游 router/index.ts 锚点
// （ia2/routes.ts 同款纪律）：可被 router.resolve 级测试直接消费，不触发
// 懒组件加载。
//
// 结构：
//   /ide → ide.shell → views/IdeShell.vue（fullscreen 自带壳，上游 App.vue
//          对 meta.fullscreen 路由隐藏 AppSidebar）
//
// 登录落点三处（守卫两处 + LoginView）由 patch 276/277 改为 /ide；
// 本文件只负责路由存在性，不承担落点逻辑。
import type { RouteRecordRaw } from 'vue-router'

/** 构造 /ide 路由（每次调用返回新对象，调用方负责 addRoute） */
export function buildIdeRoutes(): RouteRecordRaw[] {
  return [
    {
      path: '/ide',
      name: 'ide.shell',
      component: () => import('./views/IdeShell.vue'),
      meta: { fullscreen: true },
    },
  ]
}
