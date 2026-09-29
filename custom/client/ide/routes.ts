// overlay/custom/client/ide/routes.ts
// IDE 工作台主页面路由——纯路由描述，零上游 router/index.ts 锚点
// （ia2/routes.ts 同款纪律）：可被 router.resolve 级测试直接消费，不触发
// 懒组件加载。
//
// 结构：
//   /app/ide → ide.shell → views/IdeShell.vue（fullscreen 自带壳，上游 App.vue
//              对 meta.fullscreen 路由隐藏 AppSidebar）
//   /ide     → 兼容重定向 → /app/ide（V5 补遗⑤ M2：IDE 归一为驾驶舱子页面，
//              全流程 UI 不出 /app 路由树；旧深链保真）
//
// 登录落点三处（守卫两处 + LoginView）由 patch 276/277 改为 /app/ide；
// 本文件只负责路由存在性，不承担落点逻辑。
import type { RouteRecordRaw } from 'vue-router'

/** 构造 IDE 路由（每次调用返回新对象，调用方负责 addRoute） */
export function buildIdeRoutes(): RouteRecordRaw[] {
  return [
    {
      path: '/app/ide',
      name: 'ide.shell',
      component: () => import('./views/IdeShell.vue'),
      meta: { fullscreen: true },
    },
    // V5 补遗⑤ M2：旧 /ide 深链兼容（任务深链/书签/登录 redirect 参数）
    { path: '/ide', redirect: '/app/ide' },
    { path: '/ide/:rest(.*)', redirect: '/app/ide' },
  ]
}
