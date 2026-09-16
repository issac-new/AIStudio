// overlay/custom/client/loop/index.ts
// Loop Engineering — A 类注册:路由、样式。
//
// 导航条目由 patch 246 直接注入到上游 AppSidebar.vue（冻结），故此处无需
// registerNavEntry。路由用 registerRoute 注册,bootstrap 在 mount 前统一挂载。
//
// 2026-09-16 多视图重构：/hermes/loop 与 /app 渲染同一个 LoopCockpitView 壳，
// 四场景子路由经 ia2/routes.ts 的 buildSceneChildren 构造（双挂载点单一事实源，
// hermes.loop 名称落在默认场景子路由上——AppSidebar isLoopArea 家族高亮不变）。
import type { App } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { registerRoute } from '../../../registries/client'
import { features } from '../../../config/features'
import { buildSceneChildren, LOOP_SCENE_NAMES } from '../ia2/routes'

// 全局布局样式
import './styles/loop.scss'

/** 循环区路由表（纯函数导出：scene-routes 守门测试直接消费，不触发懒组件加载） */
export function buildLoopRoutes(): RouteRecordRaw[] {
  return [
    {
      path: '/hermes/loop',
      component: () => import('@/custom/ia2/views/LoopCockpitView.vue'),
      children: buildSceneChildren(LOOP_SCENE_NAMES),
    },
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
