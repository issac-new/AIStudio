// overlay/custom/client/ia2/guard.ts
// P3 Task 3 — 兼容重定向守卫（新 IA 默认开启后的旧落点承接）。
// 2026-09-18 统一导航重构（spec 决策 #3：旧路由直删、不保留 redirect）：
// cockpit 家族与 /hermes/loop 壳路由已直删，原「P4 平行共存放行」逻辑随之失效——
// 守卫只剩 loop 旧深链承接（hermes.loopRuns/loopDetail，Task 5 随 loop 模块整文件退役）。
//
// 设计说明（为何用 overlay 侧 beforeEach 而非 patch 上游 router/index.ts）：
// - 旧书签深链按名称在本守卫接力，单一守卫覆盖全部旧落点。
import type { Router, RouteLocationNormalizedGeneric } from 'vue-router'

/** 重定向目标（vue-router 位置描述的子集） */
export interface IaRedirectLocation {
  name: string
  params?: Record<string, string>
  query?: Record<string, string>
}

/**
 * 纯函数：该导航是否应改落新 IA。
 * 旧 loop 落点（hermes.loopRuns/loopDetail）RETRO=true 时放行，否则进 /app 对应区。
 * 其余名称（含已删除的 cockpit 家族）一律不改写——无匹配路由由 catch-all 兜底。
 */
export function iaCompatRedirect(
  to: Pick<RouteLocationNormalizedGeneric, 'name' | 'path' | 'params'>,
  retro: boolean,
): IaRedirectLocation | null {
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
 * bootstrap 注册 overlay 守卫——已登录 + bootstrap 延迟时，#/hermes/loop/* 等深链
 * 在无守卫窗口内完成导航并定型（旧路由静态存在，matched.length>0，no-match 兜底不救）。
 * isReady 后对 currentRoute 补跑一次兼容重定向。必须在新 IA 路由 addRoute 之后调用
 * （replace 目标 ia2.* 需已注册）。
 */
export async function applyColdStartRedirect(router: Router, retro: boolean): Promise<void> {
  await router.isReady()
  const redirect = iaCompatRedirect(router.currentRoute.value, retro)
  if (redirect) await router.replace(redirect)
}
