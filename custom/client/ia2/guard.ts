// overlay/custom/client/ia2/guard.ts
// P3 Task 3 — 兼容重定向守卫（新 IA 默认开启后的旧落点承接）。
//
// 设计说明（为何用 overlay 侧 beforeEach 而非 patch 上游 router/index.ts）：
// - 登录默认链：上游 071 守卫把无 redirect 的登录落在 hermes.cockpit（patch 073 的
//   LoginView 同落点），本守卫按路由名接力改落 /app —— 三处上游落点全被单一守卫覆盖，
//   不新增任何上游文件锚点（路由名比上下文行稳定得多）。
// - 旧路由不删：cockpit 全树、loop 三路由原样保留；RETRO=1 时守卫整体放行，
//   旧行为完整恢复（回退保险）。
// - /hermes/loop（LoopSpineView 模板编排页）不在重定向之列：编排区 Task 6 才有等价
//   能力，提前重定向会丢功能。
import type { Router, RouteLocationNormalizedGeneric } from 'vue-router'

/** 重定向目标（vue-router 位置描述的子集） */
export interface IaRedirectLocation {
  name: string
  query?: Record<string, string>
}

/** 纯函数：该导航是否应改落新 IA。retro=true 时一律放行（返回 null）。 */
export function iaCompatRedirect(
  to: Pick<RouteLocationNormalizedGeneric, 'name' | 'params'>,
  retro: boolean,
): IaRedirectLocation | null {
  if (retro) return null
  switch (to.name) {
    case 'hermes.cockpit':
      // 登录默认落点（071/073 链）与旧书签 → 总览
      return { name: 'ia2.overview' }
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
