// overlay/permpresets 域：权限预设三档（deepseek-harness 权限预设吸收，矩阵 §3.2 deepseek P2）。
//
// deepseek-harness 语义（权限预设三档——每档=工具类别放行面+审批要求面）：
// - **readonly**：只读档（read/grep 类放行；写/执行/网络全禁）；
// - **standard**：标准档（读写放行；执行与网络需审批——默认档）；
// - **full-auto**：全自动档（全放行零审批——衔接 autosched 无人值守授权）。
// 衔接 402 审批五档八态与 goal-autonomy 三档停点：本层=预设判定纯函数。
export type PresetName = 'readonly' | 'standard' | 'full-auto'
export type ToolCategory = 'read' | 'write' | 'exec' | 'network'

export interface PresetDecision {
  allowed: boolean
  needsApproval: boolean
}

const MATRIX: Record<PresetName, Record<ToolCategory, PresetDecision>> = {
  'readonly': {
    read: { allowed: true, needsApproval: false },
    write: { allowed: false, needsApproval: false },
    exec: { allowed: false, needsApproval: false },
    network: { allowed: false, needsApproval: false },
  },
  'standard': {
    read: { allowed: true, needsApproval: false },
    write: { allowed: true, needsApproval: false },
    exec: { allowed: true, needsApproval: true },
    network: { allowed: true, needsApproval: true },
  },
  'full-auto': {
    read: { allowed: true, needsApproval: false },
    write: { allowed: true, needsApproval: false },
    exec: { allowed: true, needsApproval: false },
    network: { allowed: true, needsApproval: false },
  },
}

/** 预设 × 工具类别 → 放行/审批判定（deepseek 三档语义）。 */
export function presetDecision(preset: PresetName, category: ToolCategory): PresetDecision {
  return MATRIX[preset][category]
}

/** 预设升级单调性：full-auto ⊇ standard ⊇ readonly 的放行面。 */
export function presetAllowsAtLeast(preset: PresetName, other: PresetName): boolean {
  const order: PresetName[] = ['readonly', 'standard', 'full-auto']
  return order.indexOf(preset) >= order.indexOf(other)
}
