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
  if (features.extendedI18n) {
    const { registerExtendedI18n } = await import('../../custom/client/branding/i18n')
    await registerExtendedI18n(app)
  }

  // 把 registry 收集的路由加入上游 router(addRoute 必须在 mount 前)。
  for (const route of getRegisteredRoutes()) {
    router.addRoute(route)
  }
}
