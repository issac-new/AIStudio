// overlay/permmodes 域：权限模式七档语义（cc 权限模式吸收，矩阵 §3.7 权限模式 7 档）。
//
// 词表锚点：claude-code mods/types/claude-code.d.ts:6046 六档
// （default/acceptEdits/plan/bypassPermissions/dontAsk/auto）+ readonly 补档=矩阵七档口径。
// 每档=工具类别（read/write/exec/network）放行面+审批策略；映射 deepseek 三档
// （permpresets：readonly/standard/full-auto）作交叉校验。
export type PermissionMode =
  | 'readonly' | 'plan' | 'default' | 'acceptEdits' | 'dontAsk' | 'auto' | 'bypassPermissions'
export type ToolCategory = 'read' | 'write' | 'exec' | 'network'

export interface ModeDecision {
  allowed: boolean
  needsApproval: boolean
}

const RW = { allowed: true, needsApproval: false }
const RA = { allowed: true, needsApproval: true }
const OFF = { allowed: false, needsApproval: false }

const MATRIX: Record<PermissionMode, Record<ToolCategory, ModeDecision>> = {
  readonly: { read: RW, write: OFF, exec: OFF, network: OFF },
  plan: { read: RW, write: OFF, exec: OFF, network: OFF },
  default: { read: RW, write: RA, exec: RA, network: RA },
  acceptEdits: { read: RW, write: RW, exec: RA, network: RA },
  dontAsk: { read: RW, write: RW, exec: RW, network: RA },
  auto: { read: RW, write: RW, exec: RW, network: RW },
  bypassPermissions: { read: RW, write: RW, exec: RW, network: RW },
}

/** 七档 × 工具类别 → 放行/审批判定。 */
export function modeDecision(mode: PermissionMode, category: ToolCategory): ModeDecision {
  return MATRIX[mode][category]
}

/** 七档 → deepseek 三档映射（与 permpresets 交叉校验用）。 */
export function modeToPreset(mode: PermissionMode): 'readonly' | 'standard' | 'full-auto' {
  if (mode === 'readonly' || mode === 'plan') return 'readonly'
  if (mode === 'default' || mode === 'acceptEdits') return 'standard'
  return 'full-auto'
}
