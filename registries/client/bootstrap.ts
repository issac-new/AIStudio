// overlay/registries/client/bootstrap.ts
// 在 entry shim 中、app.mount 前调用。调度各 A 类扩展注册,并把收集到的路由
// 加入上游 router。
import type { App } from 'vue'
import { features } from '../../config/features'
// '@' alias 引用上游（与 entry.mts 同因：裸相对路径在 worktree/私有上游布局解析失败）
import router from '@/router'
import { getRegisteredRoutes } from './index'

export async function bootstrapClient(app: App): Promise<void> {
  // 对应原 custom/index.ts 的 registerCustomFeatures,改为从 overlay/custom 注册。
  // 各 custom 模块内部用 registerRoute/registerNavEntry/registerComponent 收集。
  // 2026-09-30 冷启动根治：六路注册由串行 await 改并行 Promise.all——dev 下
  // 每路动态 import 是一条模块请求瀑布，串行把首个 API 请求拖到 ~2.3s（注意力
  // 条就绪 0.9-2.9s 抖动的主体，服务端全部 17-99ms 无辜）。顺序无关性：各注册
  // 只写 registry/调 router.addRoute，均发生在下方 addRoute 循环与 mount 前，
  // 相互无依赖（matrix-chat 子路由挂载在其自身注册内自理）。
  const registrations: Array<Promise<void>> = []
  if (features.matrixChat) {
    registrations.push(import('../../custom/client/matrix-chat').then(m => m.registerMatrixChat(app)))
  }
  if (features.kanbanEnhancements) {
    registrations.push(import('../../custom/client/kanban').then(m => m.registerKanbanEnhancements(app)))
  }
  if (features.branding) {
    registrations.push(import('../../custom/client/branding').then(m => m.registerBranding(app)))
  }
  // P4 用户裁决（2026-09-11）：原有 AI 协作中心（cockpit）与新 /app 六区域 IA
  // 平行共存——A 类注册（导航入口/样式/i18n 增量）恢复。
  if (features.cockpit) {
    registrations.push(import('../../custom/client/cockpit').then(m => m.registerCockpit(app)))
  }
  // 2026-09-18 统一导航 Task 5：/hermes/loop 路由家族整体退役，
  // loop 模块瘦身为纯组件/店铺库——runcenter 视图改由 ia2 运行场景（ia2.routes）挂载。
  // IDE 工作台主页面（V5 补遗⑤ M2 归一为 /app/ide，驾驶舱子页面）：
  // codex 底座 + zcode 会话 UI 全量复用。注册顺序无关守卫，仅要求在下方
  // addRoute 循环（mount 前）之前。
  if (features.ide) {
    registrations.push(import('../../custom/client/ide').then(m => m.registerIde(app)))
  } else {
    // patch 276/277 的登录守卫硬指向 /app/ide：开关关闭时注册重定向兜底，
    // 避免登录后命中无匹配路由白屏（2026-09-17 24h 评审；⑤ M2 两路径都兜）。
    router.addRoute({ path: '/ide', redirect: '/app' })
    router.addRoute({ path: '/app/ide', redirect: '/app' })
    router.addRoute({ path: '/app/ide/:rest(.*)', redirect: '/app' })
  }
  // P3 Task 3：六区域新 IA（/app 路由树）。无守卫依赖，仅要求在 mount 前完成。
  // 2026-09-18 统一导航 Task 5：旧 loop 深链兼容守卫随 /hermes/loop 家族退役删除；
  // 登录默认落点由 patch 071 守卫直落 /app。
  registrations.push(import('../../custom/client/ia2').then(m => m.registerIa2(app)))

  await Promise.all(registrations)

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
