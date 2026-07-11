// overlay/custom/client/loop/index.ts
// Loop Engineering — A 类注册:路由、导航、样式。
import type { App } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { registerRoute, registerNavEntry } from '../../../registries/client'

// 全局布局样式
import './styles/loop.scss'

export function registerLoopEngineering(app: App): void {
  const routes: RouteRecordRaw[] = [
    {
      path: '/hermes/loop',
      name: 'hermes.loop',
      component: () => import('./views/LoopSpineView.vue'),
    },
    {
      path: '/hermes/loop/:id',
      name: 'hermes.loopDetail',
      component: () => import('./views/LoopDetailView.vue'),
    },
  ]
  for (const r of routes) registerRoute(r)

  registerNavEntry({
    id: 'loop-engineering',
    label: 'Loop Engineering',
    icon: '🔄',
    section: 'main',
  })
}
