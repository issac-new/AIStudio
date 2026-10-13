// overlay/custom/client/skillgov/index.ts
// Skill 三段治理·扫描面 A 类注册入口：路由 /app/skillgov（ia2.skillgov），默认开
// （产品能力非实验特性，ontology 同款默认开语义；VITE_CUSTOM_SKILLGOV=false 显式关）。
import type { App } from 'vue'
import { registerRoute } from '../../../registries/client'

export async function registerSkillgov(_app?: App): Promise<void> {
  registerRoute({
    path: '/app/skillgov',
    name: 'ia2.skillgov',
    component: () => import('./views/SkillgovView.vue'),
    meta: { fullscreen: true },
  })
  console.log('[Custom] skillgov scan registered (/app/skillgov)')
}
