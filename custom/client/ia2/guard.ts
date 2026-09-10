// overlay/custom/client/ia2/guard.ts
// P3 Task 3 — 兼容重定向守卫（新 IA 默认开启后的旧落点承接）；Task 8 扩展为
// 路径级承接——cockpit 路由本体已退役删除，旧深链按 PATH 拦截（name 拦截仅
// 覆盖仍存在的路由记录）。
//
// 设计说明（为何用 overlay 侧 beforeEach 而非 patch 上游 router/index.ts）：
// - 登录默认链：上游 071 守卫把无 redirect 的登录改落 '/app'（Task 8 起），
//   旧书签深链按路径在本守卫接力 → 单一守卫覆盖全部旧落点。
// - 旧路由不删（loop 三路由原样保留）；RETRO=1 时守卫放行 loop 旧落点（回退保险）。
//   cockpit/matrix-chat/swarm-kanban 路径任何模式都重定向——路由本体已删除，
//   放行只会落空白页，"放行"不再保真（features.ts 处已注明语义收窄）。
import type { Router, RouteLocationNormalizedGeneric } from 'vue-router'

/** 重定向目标（vue-router 位置描述的子集） */
export interface IaRedirectLocation {
  name: string
  params?: Record<string, string>
  query?: Record<string, string>
}

/**
 * 纯函数：该导航是否应改落新 IA。
 * Task 8：cockpit 退役路径（/hermes/cockpit、/hermes/matrix-chat[、/room]）与
 * swarm-kanban 在任何模式（含 RETRO）下都承接——路由已删，无"旧行为"可回退。
 * 其余旧落点（hermes.loopRuns/loopDetail）RETRO=true 时放行。
 */
export function iaCompatRedirect(
  to: Pick<RouteLocationNormalizedGeneric, 'name' | 'path' | 'params'>,
  retro: boolean,
): IaRedirectLocation | null {
  // ── cockpit 退役路径（路径级，先于 retro 判定）──
  if (to.path === '/hermes/cockpit') return { name: 'ia2.overview' }
  if (to.path === '/hermes/matrix-chat') return { name: 'ia2.commsHome' }
  if (to.path === '/hermes/swarm-kanban') return { name: 'ia2.tasks' }
  const roomMatch = /^\/hermes\/matrix-chat\/room\/(.+)$/.exec(to.path)
  if (roomMatch) return { name: 'ia2.commsRoom', params: { roomId: roomMatch[1] } }
  // 名称级兜底（路由记录仍存在时的场景 + 测试/冷启动窗口）

  if (retro) return null
  switch (to.name) {
    case 'hermes.cockpit':
      // 登录默认落点（071/073 链）与旧书签 → 总览
      return { name: 'ia2.overview' }
    case 'hermes.matrixChat':
      // 沟通升一级（spec §9 Matrix 升一级）
      return { name: 'ia2.commsHome' }
    case 'hermes.matrixChatRoom':
      return { name: 'ia2.commsRoom', params: { roomId: String(to.params?.roomId ?? '') } }
    case 'hermes.swarmKanban':
      // 看板吸收进工作项区
      return { name: 'ia2.tasks' }
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
