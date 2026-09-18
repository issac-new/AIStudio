// overlay/custom/client/ia2/index.ts
// P3 Task 3 — 新 IA（六区域导航）注册入口。
// A 类注册：路由经 registerRoute 收集、bootstrap 统一 addRoute（loop 同款模式，
// 零上游 router/index.ts 锚点）；兼容守卫在此挂载（RETRO=1 时整体放行）。
import type { App } from 'vue'
import type { Router } from 'vue-router'
import { registerRoute } from '../../../registries/client'
import { features } from '../../../config/features'
import { buildIaRoutes } from './routes'
import { installIaCompatGuard, applyColdStartRedirect } from './guard'

// cockpit 三栏/弹窗样式（CollabScene 与 IaShellHeader 的 cockpit-* 类唯一来源）——
// 在本模块顶部同步导入（与 cockpit/index.ts 同款模式：bootstrap 动态 import 模块的
// 顶层静态样式，避免样式挂在懒加载场景组件上导致首屏/生产提取时序问题）。
import '@/custom/cockpit/styles/cockpit.scss'

/** 兼容重定向守卫挂载（独立导出，便于测试与未来复用） */
export function registerIaCompatGuard(router: Router): void {
  installIaCompatGuard(router, features.iaRetro)
}

/** 冷启动补查（审查 C-2）：守卫注册前的深链竞态兜底，retro 取 features 单一事实源 */
export function applyIaColdStartRedirect(router: Router): Promise<void> {
  return applyColdStartRedirect(router, features.iaRetro)
}

export async function registerIa2(_app?: App): Promise<void> {
  for (const route of buildIaRoutes()) registerRoute(route)
  console.log(`[Custom] ia2 (six-area IA) registered (retro=${features.iaRetro})`)
}
