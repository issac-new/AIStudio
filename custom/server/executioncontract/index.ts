// overlay/executioncontract 域（P0a，2026-11-10 执行内核统一批）：执行面契约四表的
// 单一事实源装载与校验。契约正本=config/execution-contract.json（先例=config/cli-contract.json），
// 本域只做类型化读取与不变量断言；**不接任何写路径**（P0b 起才接账本写入）。
// 守门：custom/__tests__/execution-contract.test.ts 断言四表完整性；上游四挡目录
// （vendor/zcode/.../zcode-agent-model-state.ts）变更时本契约须同步重锚。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 四挡权限模式（逐字对齐上游 ZCODE_AGENT_MODE_OPTIONS 的四个 id）。 */
export const MODE_IDS = ['build', 'guarded', 'plan', 'yolo'] as const
export type ModeId = (typeof MODE_IDS)[number]

/** 各挡的审批行为语义（决定该挡下工具调用落哪类账本记录）。 */
export const MODE_APPROVAL_BEHAVIORS = [
  'per_change_pending',
  'risk_evaluated',
  'readonly_no_write',
  'exempted_record',
] as const
export type ModeApprovalBehavior = (typeof MODE_APPROVAL_BEHAVIORS)[number]

/** 审批账本记录类型：手工两态＋免审一态，同 schema 同账（spec §8）。 */
export const APPROVAL_RECORD_TYPES = ['approval.pending', 'approval.resolved', 'approval.exempted'] as const
export type ApprovalRecordType = (typeof APPROVAL_RECORD_TYPES)[number]

/** 工具风险分级枚举；未登记工具按 shell 级评（宁高勿低）。 */
export const TOOL_RISK_CLASSES = [
  'readonly', 'write_file', 'shell', 'network', 'credential',
  'git_write', 'destructive', 'computer_use', 'mcp_external',
] as const
export type ToolRiskClass = (typeof TOOL_RISK_CLASSES)[number]

/** 会话标识种类；canonicalOwner=hermes_session 是唯一活会话事实源。 */
export const SESSION_ID_KINDS = [
  'studio_session', 'hermes_session', 'zcode_native_session', 'ekko_session', 'acp_lazy_session',
] as const
export type SessionIdKind = (typeof SESSION_ID_KINDS)[number]

export interface ModeEntry {
  id: ModeId
  name: string
  description: string
  approvalBehavior: ModeApprovalBehavior
}

export interface CodingBackend {
  appId: string
  registryId: string
  binary: string
}

export interface ToolRiskDefault {
  match: string[]
  riskClass: ToolRiskClass
  note?: string
}

export interface UnifiedEvent {
  name: string
  sources: Record<string, string>
}

export interface ExecutionContract {
  version: string
  modes: {
    canonical: ModeEntry[]
    legacyHidden: Array<{ id: string; mapsTo: string | null; note: string }>
    legacyAliases: Record<string, string>
  }
  codingBackends: {
    whitelist: CodingBackend[]
    retired: string[]
    retirementGate: string
  }
  approvalLedger: {
    recordTypes: ApprovalRecordType[]
    requiredFields: string[]
    decidedByEnum: string[]
    exemptedPolicyIdDefault: string
    sameSchemaRule: string
  }
  toolRiskClasses: {
    enum: ToolRiskClass[]
    defaults: ToolRiskDefault[]
    unregisteredRule: string
  }
  sessionIdentityMap: {
    idKinds: SessionIdKind[]
    canonicalOwner: SessionIdKind
    bidirectionalRule: string
    retiredStores: string[]
  }
  eventSemantics: {
    unifiedEvents: UnifiedEvent[]
    projectionRule: string
  }
}

const contractPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'config', 'execution-contract.json')

let cached: ExecutionContract | null = null

/** 读契约正本（进程内缓存）。P0a 只读不写；文件缺席抛错（fail-closed：契约是执法前提）。 */
export function loadExecutionContract(): ExecutionContract {
  if (cached) return cached
  const raw = JSON.parse(readFileSync(contractPath, 'utf8')) as ExecutionContract
  cached = validateContract(raw)
  return cached
}

/** 结构校验（守门测试同用）：模式目录四挡齐全、edit 遗留在位、账本字段含 policyVersion、白名单只 2 注册项。 */
export function validateContract(raw: ExecutionContract): ExecutionContract {
  const problems: string[] = []
  const modeIds = raw.modes.canonical.map(m => m.id)
  for (const id of MODE_IDS) if (!modeIds.includes(id)) problems.push(`modes.canonical 缺 ${id}`)
  if (raw.modes.canonical.length !== 4) problems.push(`modes.canonical 应为 4 挡，实际 ${raw.modes.canonical.length}`)
  if (!raw.modes.legacyHidden.some(h => h.id === 'edit')) problems.push('legacyHidden 缺 edit（历史映射不得删除）')
  for (const m of raw.modes.canonical) if (!MODE_APPROVAL_BEHAVIORS.includes(m.approvalBehavior)) problems.push(`mode ${m.id} 的 approvalBehavior 非法`)
  if (!raw.approvalLedger.requiredFields.includes('policyVersion')) problems.push('approvalLedger.requiredFields 缺 policyVersion')
  if (!raw.approvalLedger.requiredFields.includes('decidedBy')) problems.push('approvalLedger.requiredFields 缺 decidedBy')
  for (const t of raw.approvalLedger.recordTypes) if (!APPROVAL_RECORD_TYPES.includes(t)) problems.push(`recordTypes 含非法值 ${t}`)
  const registryIds = new Set(raw.codingBackends.whitelist.map(b => b.registryId))
  if (registryIds.size !== 2 || !registryIds.has('zcode') || !registryIds.has('dsh')) problems.push(`whitelist 注册项应为 {zcode,dsh}，实际 ${[...registryIds].join(',')}`)
  for (const e of raw.toolRiskClasses.defaults) if (!TOOL_RISK_CLASSES.includes(e.riskClass)) problems.push(`defaults 含非法 riskClass ${e.riskClass}`)
  if (raw.sessionIdentityMap.canonicalOwner !== 'hermes_session') problems.push('canonicalOwner 必须是 hermes_session')
  const eventNames = raw.eventSemantics.unifiedEvents.map(e => e.name)
  for (const required of ['approval.exempted', 'run.completed', 'run.failed']) if (!eventNames.includes(required)) problems.push(`unifiedEvents 缺 ${required}`)
  if (problems.length > 0) throw new Error(`execution-contract 校验失败: ${problems.join('; ')}`)
  return raw
}

/** 按挡位取该挡的工具调用应落账本记录类型（P0b 写路径的唯一取数点）。 */
export function recordTypeForMode(mode: ModeId): ApprovalRecordType {
  const behavior = loadExecutionContract().modes.canonical.find(m => m.id === mode)?.approvalBehavior
  switch (behavior) {
    case 'per_change_pending': return 'approval.pending'
    case 'risk_evaluated': return 'approval.pending'
    case 'readonly_no_write': return 'approval.exempted'
    case 'exempted_record': return 'approval.exempted'
    default: throw new Error(`mode ${mode} 无 approvalBehavior（契约损坏）`)
  }
}

/** 工具风险分级查询：精确匹配优先，`prefix:*` 通配次之，未登记兜底 shell（宁高勿低）。 */
export function riskClassForTool(tool: string): ToolRiskClass {
  const defaults = loadExecutionContract().toolRiskClasses.defaults
  const exact = defaults.find(d => d.match.includes(tool))
  if (exact) return exact.riskClass
  const wildcard = defaults.find(d => d.match.some(m => m.endsWith(':*') && tool.startsWith(m.slice(0, -1))))
  if (wildcard) return wildcard.riskClass
  return 'shell'
}

/**
 * 旧词表→四挡归一（唯一归一点）：permmodes 七档（readonly/plan/default/acceptEdits/
 * dontAsk/auto/bypassPermissions，cc 吸收词表）与 ZCode legacy 别名（acceptEdits/full-auto
 * 等）都归到四挡；未识别值归 yolo 不可取——返回 'legacy' 由调用方如实入账（宁记真不猜档）。
 */
export function fourModeOf(mode: string | null | undefined): ModeId | 'legacy' {
  switch (mode) {
    case 'readonly': case 'plan': case 'read-only': case 'read_only': return 'plan'
    case 'default': return 'build'
    case 'acceptEdits': case 'auto_edit': case 'auto-edit': case 'autoEdit':
    case 'accept_edits': case 'accept-edits': case 'dontAsk': return 'guarded'
    case 'auto': case 'bypassPermissions': case 'full-auto': case 'full_auto':
    case 'full-access': case 'full_access': case 'agent-full-access': case 'agent_full_access': return 'yolo'
    case 'build': case 'guarded': case 'yolo': return mode
    default: return 'legacy'
  }
}
