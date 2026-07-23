// overlay/custom/client/loop/graph/index.ts
// Graph Engineering — A 类注册:路由 + Mermaid 图渲染组件

import type { App } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { registerRoute } from '../../../../registries/client'
import { features } from '../../../../config/features'

// 全局图样式
import './styles/graph.scss'

export async function registerGraphEngineering(app: App): Promise<void> {
  if (!features.loopEngineering) return

  const routes: RouteRecordRaw[] = [
    {
      path: '/hermes/graph',
      name: 'hermes.graph',
      component: () => import('./views/GraphSpineView.vue'),
    },
    {
      path: '/hermes/graph/:id',
      name: 'hermes.graphDetail',
      component: () => import('./views/GraphDetailView.vue'),
    },
  ]
  for (const r of routes) registerRoute(r)
}
