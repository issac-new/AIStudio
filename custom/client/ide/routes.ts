// overlay/custom/client/ide/routes.ts
// IDE 工作台路由（补遗⑤ M2 归一，2026-09-29）：
//   路由本体迁入驾驶舱 /app 树——ia2/routes.ts buildIaRoutes 内 IaShell 子路由
//   path 'ide'（/app/ide，名称沿用 ide.shell，深链消费者零改动）。IdeShell 自带
//   共享顶区 IaGlobalTop 与 RunTrace 弹窗，IaShell 对该子路由隐藏同名件防双份。
//   本文件只产 /ide 旧直链兼容重定向（vue-router 字符串重定向自动透传
//   ?task=/?session= 等查询参数）。
//   登录落点三处（守卫两处 + LoginView）由 patch 276/277 指回 /app（13.1 登录后落驾驶舱）。
// 纪律与 ia2/routes.ts 同款：纯路由描述，可被 router.resolve 级测试直接消费，
// 不触发懒组件加载。
import type { RouteRecordRaw } from 'vue-router'

/** 构造 /ide 兼容重定向（每次调用返回新对象，调用方负责 addRoute） */
export function buildIdeRoutes(): RouteRecordRaw[] {
  return [
    {
      // 旧 /ide 直链兼容 → 驾驶舱子路由 /app/ide（M2 前的采集脚本/书签/深链）
      path: '/ide',
      redirect: '/app/ide',
    },
  ]
}
