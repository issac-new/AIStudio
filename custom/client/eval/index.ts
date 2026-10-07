// overlay/custom/client/eval/index.ts
// Eval Studio A 类注册入口（M2）：路由 /app/eval（ia2.eval），features.eval 门控
// （VITE_CUSTOM_EVAL=true 再开，观察后转默认开——S3 开关语义同款）。
// 导航入口经 ia2 FlowNavPanel 挂载（EvalNavEntry，GovernanceNavEntry 同款模式）。
import type { App } from 'vue'
import { registerRoute } from '../../../registries/client'

export async function registerEval(_app?: App): Promise<void> {
  registerRoute({
    path: '/app/eval',
    name: 'ia2.eval',
    component: () => import('./views/EvalView.vue'),
    meta: { fullscreen: true },
  })
  console.log('[Custom] eval studio registered (/app/eval)')
}
