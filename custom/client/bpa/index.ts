// overlay/custom/client/bpa/index.ts
// 流程架构工作台 A 类注册入口：路由 /app/bpa（ia2.bpa），默认开
// （产品能力非实验特性，ontology/skillgov 同款默认开语义；VITE_CUSTOM_BPA=false 显式关）。
import type { App } from 'vue'
import { registerRoute } from '../../../registries/client'

export async function registerBpa(_app?: App): Promise<void> {
  registerRoute({
    path: '/app/bpa',
    name: 'ia2.bpa',
    component: () => import('./views/BpaView.vue'),
    meta: { fullscreen: true },
  })
  console.log('[Custom] bpa process architecture registered (/app/bpa)')
}
