// overlay/custom/client/ia2/guard.ts
// P3 Task 3 — 兼容重定向守卫（新 IA 默认开启后的旧落点承接）。
// P4 平行共存（2026-09-11 用户裁决）：原有 AI 协作中心（cockpit）恢复并与
// 新 /app 六区域 IA 平行共存——cockpit 家族落点不再改写，守卫只承接
// loop 旧深链（hermes.loopRuns/loopDetail）。
//
// 设计说明（为何用 overlay 侧 beforeEach 而非 patch 上游 router/index.ts）：
// - 登录默认链：上游 071 守卫把无 redirect 的登录改落 '/app'，
//   旧书签深链按路径在本守卫接力 → 单一守卫覆盖全部旧落点。
import type { Router, RouteLocationNormalizedGeneric } from 'vue-router'

/** 重定向目标（vue-router 位置描述的子集） */
export interface IaRedirectLocation {
  name: string
  params?: Record<string, string>
  query?: Record<string, string>
}

/**
 * 纯函数：该导航是否应改落新 IA。
 * P4 平行共存：cockpit 家族已恢复本体路由，不做改写。
 * 旧 loop 落点（hermes.loopRuns/loopDetail）RETRO=true 时放行，否则进 /app 对应区。
 */
export function iaCompatRedirect(
  to: Pick<RouteLocationNormalizedGeneric, 'name' | 'path' | 'params'>,
  retro: boolean,
): IaRedirectLocation | null {
  // P4 平行共存：cockpit 家族落点（/hermes/cockpit 及其 matrix-chat/swarm-kanban
  // 子路由）不再改写——原有 AI 协作中心保留功能，与新 /app IA 平行可达。

  if (retro) return null
  switch (to.name) {
    case 'hermes.loopRuns':
      // 旧运行中心 → /app/runs
      return { name: 'ia2.runs' }
    case 'hermes.loopDetail': {
      // 旧 loop 详情 → 运行列表并携带 loop 上下文（brief 指定 ?loop=:id）
      const id = to.params?.id
      return { name: 'ia2.runs', query: { loop: id == null ? '' : String(id) } }
    }
    default:
      return null
  }
}

/** 把守卫挂到 router（registerIa2 调用；测试可直接传 retro 布尔） */
export function installIaCompatGuard(router: Router, retro: boolean): void {
  router.beforeEach(to => {
    const redirect = iaCompatRedirect(to, retro)
    return redirect ?? true
  })
}

/**
 * 冷启动补查（审查 C-2）：初始导航在 entry.mts 的 app.use(router) 即启动，早于
 * bootstrap 注册 overlay 守卫——已登录 + bootstrap 延迟时，#/hermes/cockpit 等深链
 * 在无守卫窗口内完成导航并定型（旧路由静态存在，matched.length>0，no-match 兜底不救）。
 * isReady 后对 currentRoute 补跑一次兼容重定向。必须在新 IA 路由 addRoute 之后调用
 * （replace 目标 ia2.* 需已注册）。
 */
export async function applyColdStartRedirect(router: Router, retro: boolean): Promise<void> {
  await router.isReady()
  const redirect = iaCompatRedirect(router.currentRoute.value, retro)
  if (redirect) await router.replace(redirect)
}
