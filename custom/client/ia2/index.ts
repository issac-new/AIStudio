// overlay/custom/client/ia2/index.ts
// P3 Task 3 — 新 IA（六区域导航）注册入口。
// A 类注册：路由经 registerRoute 收集、bootstrap 统一 addRoute（零上游
// router/index.ts 锚点）。
// 2026-09-18 统一导航 Task 5：旧 loop 深链兼容守卫（guard.ts）随 /hermes/loop
// 路由家族整体退役删除——无守卫窗口内的冷深链由 catch-all 兜底承接。
import type { App } from 'vue'
import { registerRoute } from '../../../registries/client'
import { buildIaRoutes, ia2NotFoundGuard } from './routes'
// 诚实 404 守卫（2026-10-21）：上游 catch-all 改道 ia2.notFound（只读上游 router，
// 注册一次；redirect 语义不动）。
import router from '@/router'

// cockpit 三栏/弹窗样式（CollabScene 与 IaShellHeader 的 cockpit-* 类唯一来源）——
// 在本模块顶部同步导入（与 cockpit/index.ts 同款模式：bootstrap 动态 import 模块的
// 顶层静态样式，避免样式挂在懒加载场景组件上导致首屏/生产提取时序问题）。
import '@/custom/cockpit/styles/cockpit.scss'
// ECharts 语义色缓存随主题失效（批 A6，双落点幂等；详见 theme-bridge.ts 头注）
import '@/custom/cockpit/styles/theme-bridge'
// 共享 UI 基元样式（批 B1：统一空态类；ia2 注册无门控=全局面可用）
import '@/custom/ui/styles/ui.scss'
// 全站壳层覆盖（2026-10-18 用户裁定：上游 StudioNavigationRail 全站退役）——
// bootstrap 顶层静态导入；IDE/专题等独立 fullscreen 路由不加载 IaShell 也生效。
import './styles/shell-overrides.scss'

export async function registerIa2(_app?: App): Promise<void> {
  router.beforeEach(ia2NotFoundGuard)
  for (const route of buildIaRoutes()) registerRoute(route)
  console.log('[Custom] ia2 (six-area IA) registered')
}
