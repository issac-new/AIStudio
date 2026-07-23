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
}
