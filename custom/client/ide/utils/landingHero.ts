// overlay/custom/client/ide/utils/landingHero.ts
// 裸落地引导空态的显示判定（纯函数，供 IdeShell 组合与守门测试共用）。
//
// 背景：/app/ide 是登录默认落点（patch 276/277），但深链（?task/?session）才有
// 任务上下文——裸落地此前直接进会话栏的自动恢复，新用户没有任何引导。run13
// 步18 错帧事件后补齐任务导向空态：裸落地先给「最近任务速选 + 进入工作区」。
export interface LandingHeroState {
  /** 已激活任务（深链 ?task 或用户速选后非空） */
  activeTaskId: string | null
  /** 路由 query.task（深链在途、store 尚未落定时也视为有上下文） */
  queryTask: unknown
  /** 路由 query.session（会话深链自带上下文） */
  querySession: unknown
  /** 用户已 engage（速选过任务或点过「进入会话工作区」）——本次访问不再打扰 */
  engaged: boolean
}

/** 是否显示裸落地引导空态 */
export function shouldShowLandingHero(state: LandingHeroState): boolean {
  if (state.engaged) return false
  if (state.activeTaskId) return false
  // query 存在且非空串即视为深链（数组取值等异常形态按存在处理）
  const hasQuery = (v: unknown) => v != null && v !== ''
  return !hasQuery(state.queryTask) && !hasQuery(state.querySession)
}
