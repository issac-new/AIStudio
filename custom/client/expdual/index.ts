// overlay/custom/client/expdual/index.ts
// 双轨经验台账·A 类注册入口：路由 /app/expdual（ia2.expdual），默认开
// （产品能力；VITE_CUSTOM_EXPDUAL=false 显式关导航）。skillgov 同款 IaFeatureShell 模式：
// 路由无条件注册，关闭时由壳渲染「未启用」说明页（开关只管导航可见性，K10 口径）。
import type { App } from 'vue'
import { registerRoute } from '../../../registries/client'

export async function registerExpdual(_app?: App): Promise<void> {
  registerRoute({
    path: '/app/expdual',
    name: 'ia2.expdual',
    component: () => import('../ia2/views/IaFeatureShell.vue'),
    props: { feature: 'expdual' },
    meta: { fullscreen: true },
  })
  console.log('[Custom] expdual ledger registered (/app/expdual)')
}
