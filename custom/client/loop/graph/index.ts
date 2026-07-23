// overlay/custom/client/loop/graph/index.ts
// Graph Engineering 已合并入 Loop Engineering（单一「循环工程」入口）。
// /hermes/graph/* 路由重定向到 /hermes/loop/*，保持向后兼容。
import type { App } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { registerRoute } from '../../../../registries/client'
import { features } from '../../../../config/features'

export async function registerGraphEngineering(app: App): Promise<void> {
  if (!features.loopEngineering) return

  const routes: RouteRecordRaw[] = [
    {
      path: '/hermes/graph',
      redirect: '/hermes/loop',
    },
    {
      path: '/hermes/graph/:id',
      redirect: (to) => `/hermes/loop/${to.params.id?.toString().replace(/^graph-/, '')}`,
    },
  ]
  for (const r of routes) registerRoute(r)
}
