// overlay/custom/client/loop/index.ts
// Loop Engineering — A 类注册:路由、样式。
//
// 导航条目由 patch 246 直接注入到上游 AppSidebar.vue（冻结），故此处无需
// registerNavEntry。路由用 registerRoute 注册,bootstrap 在 mount 前统一挂载。
//
// 2026-09-18 统一导航重构（Task 1）：/hermes/loop 壳子树（LoopCockpitView 双挂载点）
// 随四场景双挂载架构一并退役——ia2/routes.ts 不再导出 buildSceneChildren /
// LOOP_SCENE_NAMES，本文件随之不再 import ia2/routes 的任何符号。
// 保留 runcenter 两条路由（/hermes/loop/runs、/hermes/loop/runs/:runId）与
// /hermes/loop/:id 详情；整个文件由后续 Task 5 收口删除。
import type { App } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { registerRoute } from '../../../registries/client'
import { features } from '../../../config/features'

// 全局布局样式
import './styles/loop.scss'

/** 循环区路由表（纯函数导出：scene-routes 守门测试直接消费，不触发懒组件加载） */
export function buildLoopRoutes(): RouteRecordRaw[] {
  return [
    {
      // P2 Task 5 — 运行中心。静态段须排在 '/hermes/loop/:id' 之前。
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
}

export async function registerLoopEngineering(_app: App): Promise<void> {
  // I4: 功能开关。默认开启(import.meta.env.VITE_CUSTOM_LOOP !== 'false')。
  if (!features.loopEngineering) return

  for (const r of buildLoopRoutes()) registerRoute(r)
}
