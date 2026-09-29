// overlay/custom/client/ide/index.ts
// IDE 工作台主页面（/ide）A 类注册入口。
// 路由经 registerRoute 收集、bootstrap 统一 addRoute（ia2 同款模式，
// 零上游 router/index.ts 锚点）；登录落点三处由 patch 276/277 承担。
import type { App } from 'vue'
import { registerRoute } from '../../../registries/client'
import { features } from '../../../config/features'
import { buildIdeRoutes } from './routes'

export async function registerIde(_app?: App): Promise<void> {
  if (!features.ide) {
    console.log('[Custom] IDE workspace disabled via feature flag')
    return
  }
  for (const route of buildIdeRoutes()) registerRoute(route)
  console.log('[Custom] IDE workspace (/ide) registered')
}
