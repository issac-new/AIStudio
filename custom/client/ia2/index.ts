// overlay/custom/client/ia2/index.ts
// P3 Task 3 — 新 IA（六区域导航）注册入口。
// A 类注册：路由经 registerRoute 收集、bootstrap 统一 addRoute（loop 同款模式，
// 零上游 router/index.ts 锚点）；兼容守卫在此挂载（RETRO=1 时整体放行）。
import type { App } from 'vue'
import type { Router } from 'vue-router'
import { registerRoute } from '../../../registries/client'
import { features } from '../../../config/features'
import { buildIaRoutes } from './routes'
import { installIaCompatGuard } from './guard'

/** 兼容重定向守卫挂载（独立导出，便于测试与未来复用） */
export function registerIaCompatGuard(router: Router): void {
  installIaCompatGuard(router, features.iaRetro)
}

export async function registerIa2(_app?: App): Promise<void> {
  for (const route of buildIaRoutes()) registerRoute(route)
  console.log(`[Custom] ia2 (six-area IA) registered (retro=${features.iaRetro})`)
}
