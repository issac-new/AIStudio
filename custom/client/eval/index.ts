// overlay/custom/client/eval/index.ts
// Eval Studio A 类注册入口：路由 /app/eval（ia2.eval），features.eval 门控
// （2026-10-19 起默认开，VITE_CUSTOM_EVAL=false 显式关——评测已织进⑥治理）。
// 导航入口经 ISLAND_NAVS（nav-centers.ts）挂载。
import type { App } from 'vue'
import { registerRoute } from '../../../registries/client'

export async function registerEval(_app?: App): Promise<void> {
  registerRoute({
    path: '/app/eval',
    name: 'ia2.eval',
    component: () => import('../ia2/views/IaFeatureShell.vue'),
    props: { feature: 'eval' },
    meta: { fullscreen: true },
  })
  console.log('[Custom] eval studio registered (/app/eval)')
}
