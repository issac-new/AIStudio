// overlay/custom/client/ia2/index.ts
// P3 Task 3 — 新 IA（六区域导航）注册入口。
// A 类注册：路由经 registerRoute 收集、bootstrap 统一 addRoute（零上游
// router/index.ts 锚点）。
// 2026-09-18 统一导航 Task 5：旧 loop 深链兼容守卫（guard.ts）随 /hermes/loop
// 路由家族整体退役删除——无守卫窗口内的冷深链由 catch-all 兜底承接。
import type { App } from 'vue'
import { registerRoute } from '../../../registries/client'
import { buildIaRoutes } from './routes'

// cockpit 三栏/弹窗样式（CollabScene 与 IaShellHeader 的 cockpit-* 类唯一来源）——
// 在本模块顶部同步导入（与 cockpit/index.ts 同款模式：bootstrap 动态 import 模块的
// 顶层静态样式，避免样式挂在懒加载场景组件上导致首屏/生产提取时序问题）。
import '@/custom/cockpit/styles/cockpit.scss'

export async function registerIa2(_app?: App): Promise<void> {
  for (const route of buildIaRoutes()) registerRoute(route)
  console.log('[Custom] ia2 (six-area IA) registered')
}
