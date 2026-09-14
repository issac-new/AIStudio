// overlay/custom/client/loop/index.ts
// Loop Engineering — A 类注册:路由、样式。
//
// 导航条目由 patch 246 直接注入到上游 AppSidebar.vue（冻结），故此处无需
// registerNavEntry。路由用 registerRoute 注册,bootstrap 在 mount 前统一挂载。
//
// 2026-09-14 驾驶舱重构：/hermes/loop 与 /app（ia2.overview）渲染同一个
// LoopCockpitView 单页——两个入口一个页面；旧 LoopSpineView 退役删除。
import type { App } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { registerRoute } from '../../../registries/client'
import { features } from '../../../config/features'

// 全局布局样式
import './styles/loop.scss'

export async function registerLoopEngineering(app: App): Promise<void> {
  // I4: 功能开关。默认开启(import.meta.env.VITE_CUSTOM_LOOP !== 'false')。
  if (!features.loopEngineering) return

  const routes: RouteRecordRaw[] = [
    {
      // 循环驾驶舱单页（与 /app 的 ia2.overview 同一视图；路由名冻结不改——
      // AppSidebar「循环工程图」入口的 isLoopArea 高亮按 hermes.loop* 家族匹配）
      path: '/hermes/loop',
      name: 'hermes.loop',
      component: () => import('@/custom/ia2/views/LoopCockpitView.vue'),
    },
    {
      // P2 Task 5 — 运行中心。静态段须排在 '/hermes/loop/:id' 之前（vue-router 4
      // 排名机制下静态段本就优先，此处仍显式前置以免阅读歧义）。
      path: '/hermes/loop/runs',
      name: 'hermes.loopRuns',
      component: () => import('./runcenter/views/RunCenterView.vue'),
    },
    {
      // P2 Task 6 — 运行详情（执行图 + 时间轴回放 + 三级分辨率）。
      path: '/hermes/loop/runs/:runId',
      name: 'hermes.loopRunDetail',
      component: () => import('./runcenter/views/RunDetailView.vue'),
    },
    {
      path: '/hermes/loop/:id',
      name: 'hermes.loopDetail',
      component: () => import('./views/LoopDetailView.vue'),
    },
  ]
  for (const r of routes) registerRoute(r)
}
