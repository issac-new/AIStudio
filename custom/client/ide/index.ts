// overlay/custom/client/ide/index.ts
// IDE 工作台（/app/ide，ia2 IaShell 子路由）A 类注册入口。
// 路由本体在 ia2/routes.ts buildIaRoutes（补遗⑤ M2 归一）；本文件注册
// /ide 旧直链兼容重定向（查询参数透传）；登录落点三处由 patch 276/277 指向 /app。
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
  console.log('[Custom] IDE workspace (/app/ide via ia2; /ide legacy redirect) registered')
}
