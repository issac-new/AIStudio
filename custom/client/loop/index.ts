// overlay/custom/client/loop/index.ts
// Loop Engineering — A 类注册:路由、样式。
//
// 导航条目由 patch 133 直接注入到上游 AppSidebar.vue,故此处无需
// registerNavEntry。路由用 registerRoute 注册,bootstrap 在 mount 前统一挂载。
//
// 注意:registerLoopEngineering 是 async 的(尽管内部目前没有 await)——
// 这与其它 A 类注册(branding/cockpit)保持一致,便于未来在注册阶段做异步初始化。
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
}
