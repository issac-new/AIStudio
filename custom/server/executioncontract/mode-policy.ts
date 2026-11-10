// overlay/executioncontract 域（P1，2026-11-10 执行内核统一批 Task 3）：
// 四挡权限判定器——纯函数、无 IO、未知档 fail-closed 为 ask（不猜 yolo）。
// 词表单一事实源=config/execution-contract.json（四挡目录与上游逐字重锚）。
// 硬拒绝底线（hardline/user-deny/sudo-guard）在 Hermes approval_floors 上游先行，
// 本判定器不重复也不放宽（yolo 全放行只在 floors 未拦时到达此处）。
// decidedByForResult 与 vendor/hermes-agent/tools/approval_ledger.py 的键语义对齐。
import type { ApprovalRecordType, ModeId, ToolRiskClass } from './index'

/** 高风险类目：guarded 档须人工确认的集合（与契约 riskClass 枚举对齐）。 */
const GUARDED_ASK: ReadonlySet<ToolRiskClass> = new Set<ToolRiskClass>([
  'credential', 'git_write', 'destructive', 'computer_use', 'mcp_external',
])

export interface FourModeDecision {
  action: 'allow' | 'ask' | 'deny'
  recordType: ApprovalRecordType
  decidedBy: string
}

/** 四挡 × 工具风险 → 准入动作与账本记录形态。tool 仅作记录载体，判定只看 riskClass。 */
export function evaluateFourMode(input: { mode: ModeId | string; tool: string; riskClass: ToolRiskClass }): FourModeDecision {
  switch (input.mode) {
    case 'build':
      if (input.riskClass === 'readonly') return { action: 'allow', recordType: 'approval.exempted', decidedBy: 'policy:readonly' }
      return { action: 'ask', recordType: 'approval.pending', decidedBy: 'policy:risk-evaluated' }
    case 'guarded':
      if (GUARDED_ASK.has(input.riskClass)) return { action: 'ask', recordType: 'approval.pending', decidedBy: 'policy:risk-evaluated' }
      return { action: 'allow', recordType: 'approval.exempted', decidedBy: 'policy:risk-evaluated' }
    case 'plan':
      if (input.riskClass === 'readonly') return { action: 'allow', recordType: 'approval.exempted', decidedBy: 'policy:readonly' }
      // plan=只读工具集：非只读直接拒绝（不询问——plan 挡本就没有执行面可问）
      return { action: 'deny', recordType: 'approval.resolved', decidedBy: 'policy:readonly' }
    case 'yolo':
      return { action: 'allow', recordType: 'approval.exempted', decidedBy: 'policy:auto' }
    default:
      // 未知档 fail-closed：待人工，不猜 yolo
      return { action: 'ask', recordType: 'approval.pending', decidedBy: 'policy:risk-evaluated' }
  }
}

/** 引擎原生档归一：只输出 build|guarded|plan|yolo；edit 隐藏历史值按受控编辑
 *  语义归 guarded（不降 build——上游注释约束）；未知归 build（四挡内最保守）。 */
export function zcodeNativeMode(mode: string | null | undefined): ModeId {
  switch (mode) {
    case 'build': case 'guarded': case 'plan': case 'yolo': return mode
    case 'edit': case 'autoEdit': case 'acceptEdits': case 'accept_edits': case 'auto_edit': case 'auto-edit': return 'guarded'
    case 'auto': case 'bypassPermissions': case 'full-auto': case 'full_auto': case 'full-access': case 'full_access': return 'yolo'
    case 'readonly': case 'read-only': case 'read_only': return 'plan'
    default: return 'build'
  }
}

/** DSH 布尔权限推导：四挡在场时非 yolo 一律不自动放行（DSH ACP 的
 *  permissionRequired=true → 权限请求 reject_once，人工面留待 P2 承接实现）；
 *  未配置档=现状原样（approvalRequired 透传，缺省 undefined 不改变既有默认）。 */
export function dshPermissionRequired(
  permissionMode: ModeId | undefined, approvalRequired: boolean | undefined,
): boolean | undefined {
  if (permissionMode === undefined) return approvalRequired
  return permissionMode !== 'yolo'
}

/** Hermes 守卫审批结果（Python 字典形状）→ 账本记录形态；与 approval_ledger.py
 *  的键语义逐条对齐（user_approved/user_consent/pre_approved 外的 approved 均为
 *  策略放行）。无判定键时返回 null（不产记录）。 */
export function decidedByForResult(
  result: Record<string, unknown>, mode: ModeId | string,
): { recordType: ApprovalRecordType; decidedBy: string } | null {
  if (result.approval_required === true || result.pending_approval === true) {
    return { recordType: 'approval.pending', decidedBy: 'policy:risk-evaluated' }
  }
  if (result.approved === true) {
    if (result.user_approved === true) return { recordType: 'approval.resolved', decidedBy: 'user' }
    return { recordType: 'approval.exempted', decidedBy: mode === 'guarded' ? 'policy:risk-evaluated' : 'policy:auto' }
  }
  if (result.approved === false) {
    if (result.user_consent === false) return { recordType: 'approval.resolved', decidedBy: 'user' }
    return { recordType: 'approval.resolved', decidedBy: 'policy:auto' }
  }
  return null
}
