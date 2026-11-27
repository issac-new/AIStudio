// custom/server/agentidentity/roster-gaps.ts
// 户口五要素缺口判定（纯函数，不读盘）。
//
// 2026-11-27 自 agent-identity.ts 下沉为独立模块：准入并查户口（lifecycle.canTransition）需要
// 复用本判定，而 agent-identity.ts 已依赖 lifecycle.ts，反向引用会成环。agent-identity.ts
// 重新导出同名符号，既有消费方的导入路径不变。
//
// 来源（2026-11-05 组织治理能力批）：《定义权之争》下篇动作 3「给 Agent 发户口」——
// 名字、能力边界、权限范围、审计要求、负责人。
//
// 纪律：缺口本身不 fail-closed 拒绝注册。存量 profile 身份普遍缺能力边界与审计要求，
// 一次性拒绝会让既有部署立即不可用。注册放行、缺口可见；准入（lifecycle）才把缺口当硬门槛。

export type RosterField = 'name' | 'capability-boundary-can' | 'capability-boundary-cannot'
  | 'permission-scope' | 'audit-requirement' | 'owner'

export interface RosterGap {
  field: RosterField
  /** 人读说明：缺什么、为什么这条要单独判 */
  detail: string
}

/** 判定所需的身份最小面（结构化类型：不要求完整 AgentIdentity）。 */
export interface RosterSubject {
  name?: string
  owner?: string
  toolAllowlist?: string[]
  capabilityBoundary?: { can?: string[]; cannot?: string[] }
  auditRequirement?: { sampling?: number; retentionDays?: number; note?: string }
}

/** 单身份的户口缺项（空数组=五要素齐备）。 */
export function rosterGaps(identity: RosterSubject): RosterGap[] {
  const gaps: RosterGap[] = []
  if (typeof identity.name !== 'string' || !identity.name.trim()) {
    gaps.push({ field: 'name', detail: '缺身份名——无名身份无法被派单与追溯' })
  }
  const can = Array.isArray(identity.capabilityBoundary?.can) ? identity.capabilityBoundary!.can.filter((c) => c && String(c).trim()) : []
  const cannot = Array.isArray(identity.capabilityBoundary?.cannot) ? identity.capabilityBoundary!.cannot.filter((c) => c && String(c).trim()) : []
  if (can.length === 0) {
    gaps.push({ field: 'capability-boundary-can', detail: '缺能力边界（能做什么）——只写许可不写设计意图，能力与权限会被混同' })
  }
  if (cannot.length === 0) {
    gaps.push({ field: 'capability-boundary-cannot', detail: '缺能力边界（不做什么）——不声明禁区等于默许扩权' })
  }
  if (!Array.isArray(identity.toolAllowlist) || identity.toolAllowlist.length === 0) {
    gaps.push({ field: 'permission-scope', detail: '缺权限范围——空白名单是「未声明」，不等于无限制' })
  }
  const sampling = identity.auditRequirement?.sampling
  if (!identity.auditRequirement || typeof sampling !== 'number' || !Number.isFinite(sampling) || sampling <= 0) {
    gaps.push({ field: 'audit-requirement', detail: '缺审计要求（抽样比例）——凭证可撤销不等于有审计' })
  }
  if (typeof identity.owner !== 'string' || !identity.owner.trim()) {
    gaps.push({ field: 'owner', detail: '缺负责人——没有人愿意为之负责的结果在组织里等于不存在' })
  }
  return gaps
}

export function rosterStatus(identity: RosterSubject): 'complete' | 'blocked' {
  return rosterGaps(identity).length === 0 ? 'complete' : 'blocked'
}
