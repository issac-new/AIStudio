// overlay/custom/client/projects/index.ts
// 项目工作流 A 类注册入口（「项目列表+详情」客户端页）：路由 /app/projects
// （projects）与 /app/projects/:id（projectDetail），顶层注册 + ProjectShellView
// 装 IaShell（IaFeatureShell 同款——独立 fullscreen 页保持工作台壳一致）。
// 导航入口=nav-centers COMMON_NAVS「项目」（IaSideNav 常用组）。
import type { App } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { registerRoute } from '../../../registries/client'

export const PROJECT_ROUTES: RouteRecordRaw[] = [
  {
    path: '/app/projects',
    name: 'projects',
    component: () => import('./views/ProjectShellView.vue'),
    props: { view: 'list' },
    meta: { fullscreen: true },
  },
  {
    path: '/app/projects/:id',
    name: 'projectDetail',
    component: () => import('./views/ProjectShellView.vue'),
    props: { view: 'detail' },
    meta: { fullscreen: true },
  },
]

export async function registerProjects(_app?: App): Promise<void> {
  for (const route of PROJECT_ROUTES) registerRoute(route)
  console.log('[Custom] projects workflow registered (/app/projects)')
}
