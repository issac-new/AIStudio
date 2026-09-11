// overlay/registries/client/bootstrap.ts
// 在 entry shim 中、app.mount 前调用。调度各 A 类扩展注册,并把收集到的路由
// 加入上游 router。
import type { App } from 'vue'
import { features } from '../../config/features'
import router from '../../../upstream/hermes-studio/packages/client/src/router'
import { getRegisteredRoutes } from './index'

export async function bootstrapClient(app: App): Promise<void> {
  // 对应原 custom/index.ts 的 registerCustomFeatures,改为从 overlay/custom 注册。
  // 各 custom 模块内部用 registerRoute/registerNavEntry/registerComponent 收集。
  if (features.matrixChat) {
    const { registerMatrixChat } = await import('../../custom/client/matrix-chat')
    await registerMatrixChat(app)
  }
  if (features.kanbanEnhancements) {
    const { registerKanbanEnhancements } = await import('../../custom/client/kanban')
    await registerKanbanEnhancements(app)
  }
  if (features.branding) {
    const { registerBranding } = await import('../../custom/client/branding')
    await registerBranding(app)
  }
  // P4 用户裁决（2026-09-11）：原有 AI 协作中心（cockpit）与新 /app 六区域 IA
  // 平行共存——A 类注册（导航入口/样式/i18n 增量）恢复。
  if (features.cockpit) {
    const { registerCockpit } = await import('../../custom/client/cockpit')
    await registerCockpit(app)
  }
  if (features.loopEngineering) {
    const { registerLoopEngineering } = await import('../../custom/client/loop')
    await registerLoopEngineering(app)
    const { registerGraphEngineering } = await import('../../custom/client/loop/graph')
    await registerGraphEngineering(app)
  }
  // P3 Task 3：六区域新 IA（/app 路由树 + 兼容重定向守卫）。
  // 守卫依赖 router 实例，与 loop 的 addRoute 同样必须在 mount 前完成。
  // 无条件注册：登录默认落点由 patch 071 守卫直落 /app；cockpit 平行共存后
  // 兼容守卫不再改写 cockpit 家族落点（retro 仅管旧 loop 深链）。
  {
    const { registerIa2, registerIaCompatGuard } = await import('../../custom/client/ia2')
    await registerIa2(app)
    registerIaCompatGuard(router)
  }
  // 注:i18n 翻译键不在此运行时 merge —— 原 custom 的 registerExtendedI18n 是空壳,
  // 实际翻译是直接写在上游 locale 文件里的(现经 patch 044-053 注入)。无需运行时注册。

  // 把 registry 收集的路由加入上游 router(addRoute 必须在 mount 前)。
  for (const route of getRegisteredRoutes()) {
    router.addRoute(route)
  }

  // 注册需要挂载为 cockpit 子路由的动态路由（如 matrix-chat）
  if (features.matrixChat) {
    const { registerMatrixChatRoutes } = await import('../../custom/client/matrix-chat')
    registerMatrixChatRoutes(router)
  }

  // 冷启动补查（P3 Task 3 审查 C-2）：初始导航早于 overlay 守卫注册，已登录深链
  // （#/hermes/cockpit 等）可能在无守卫窗口内定型。isReady 后补跑一次兼容重定向。
  // 必须在上方 addRoute 之后（replace 目标 ia2.* 需已注册）。
  {
    const { applyIaColdStartRedirect } = await import('../../custom/client/ia2')
    await applyIaColdStartRedirect(router)
  }
}
