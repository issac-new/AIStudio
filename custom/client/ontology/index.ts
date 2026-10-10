// overlay/custom/client/ontology/index.ts
// 本体工作台注册入口：路由 /app/ontology（ia2.ontology，fullscreen）。
// features.ontology 门控（默认开，VITE_CUSTOM_ONTOLOGY=false 显式关）。
// 导航入口经 ia2 FlowNavPanel 挂载（OntologyNavEntry，EvalNavEntry 同款模式）。
import type { App } from 'vue'
import { registerRoute } from '../../../registries/client'

export async function registerOntology(_app?: App): Promise<void> {
  registerRoute({
    path: '/app/ontology',
    name: 'ia2.ontology',
    component: () => import('./views/OntologyView.vue'),
    meta: { fullscreen: true },
  })
  console.log('[Custom] ontology studio registered (/app/ontology)')
}
