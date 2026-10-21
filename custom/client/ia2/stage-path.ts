// overlay/custom/client/ia2/stage-path.ts
// 路径 → 阶段键的唯一投影（2026-10-21 IA 收口）：
// routes.areaForPath（场景条 / ia store）与 nav-centers.centerForPath（左栏高亮）
// 曾各写一份同义规则，靠注释「同步」维持；本模块为唯一实现，二者只做类型适配。
// 纪律：本模块保持纯函数、无 Vue / 路由依赖，可被任何客户端模块与测试直接消费。

export type StageKey = 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'stage6'

/** 路径归属规则（段边界匹配，避免 /app/teamship 误判为 /app/teams）。 */
export function stageKeyForPath(path: string): StageKey | null {
  if (path !== '/app' && !path.startsWith('/app/')) return null

  // ①搭建：组织、账号、团队、智能体与搭建阶段页本身
  if (path === '/app/teams' || path.startsWith('/app/teams/')) return 'stage1'
  if (path === '/app/agents' || path.startsWith('/app/agents/')) return 'stage1'
  if (path === '/app/stage/setup' || path.startsWith('/app/stage/setup/')) return 'stage1'

  // ②-⑥ 阶段页
  if (path === '/app/stage/reqs' || path.startsWith('/app/stage/reqs/')) return 'stage2'
  if (path === '/app/stage/design' || path.startsWith('/app/stage/design/')) return 'stage3'
  if (path === '/app/stage/build' || path.startsWith('/app/stage/build/')) return 'stage4'
  if (path === '/app/stage/accept' || path.startsWith('/app/stage/accept/')) return 'stage5'
  if (path === '/app/stage/govern' || path.startsWith('/app/stage/govern/')) return 'stage6'

  // 全流程推演是独立导航域（2026-10-20 拆分裁定）：不参与六阶段高亮
  if (path === '/app/sim' || path.startsWith('/app/sim/')) return null

  // 旧治理深链 → ⑥治理
  if (path === '/app/gov' || path.startsWith('/app/gov/')) return 'stage6'

  // 裸 /app = 旅程页（默认入口，搭建区①高亮）
  if (path === '/app' || path === '/app/') return 'stage1'

  // 其余 /app 家族＝开发期日常工具集（看板/沟通/审批/IDE 等）归④
  return 'stage4'
}
