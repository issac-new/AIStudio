/**
 * H3 v1 工具执行执法门（2026-10-08 六文调研轮 H3，BCG"按流程定义自治级别和决策
 * 边界"的执行面）。零新引擎 patch：patch 565 瀑布的 preExecute {allow:false} 拦截
 * 通道早已就绪，缺的只是 overlay 侧把"只观测"升级为"按策略裁决"——本模块即该裁决。
 *
 * 三级策略链（优先级从高到低，先命中先裁决）：
 *   0. 硬边界（先于身份链与审批桥，批单不可豁免；P0 Task 5 平台重写收口）：
 *      - 未知 MCP 工具（mcp-unknown）：动词启发式（单层分类信号）判不出 → 拒（修复出口=登记映射）；
 *      - 沙箱路径（sandbox-path）：真实路径判定（cwd 解析+realpath canonicalize）；
 *      - 沙箱终端（sandbox-terminal-unavailable）：roots 配置即沙箱模式，
 *        terminal/code 无真实 OS 沙箱证明 → 拒（不用 Shell 文本检查代替）。
 *   1. 自治阶梯（autonomyladder，per profile / workflow:节点）：
 *      - insight 档：只放 read 类工具（只出洞察，人决策人执行）
 *      - assist 档：放行，但命中人工确认点或风险超 maxRiskTier → 拒
 *      - auto 档：放行，风险超 maxRiskTier → 拒
 *   2. 全局权限模式（HERMES_TOOL_ENFORCE_MODE，七档矩阵 permmodes）：
 *      矩阵判 OFF → 拒；判 RA → 视同 assist 的"需确认"（v1 无交互审批桥 → 拒并
 *      指引人走审批流；交互桥接见规格档 H3 待办）
 *   3. 无任何配置 → 放行（未配置不执法——诚实边界，不装已治理）
 *
 * 总闸（D1 2026-11-05 权限最小化批起）：默认开——HERMES_TOOL_ENFORCE 未设或 =1 即执法，
 * 显式 =0 关闭（逃生门）；managed-settings 的 toolEnforceLocked 可锁死（env 也改不了）。
 * 默认开的底气=策略文件缺席时回落仓内默认策略包（policy-store builtin-default，
 * 红线基线随仓分发），而非无配置裸放。内部任何异常 fail-open；每次拒绝发 govbus
 * security/high 事件留痕。
 *
 * strict 可选姿态（2026-10-21 AGT 吸收轮 F，用户裁定「全做」）：HERMES_TOOL_ENFORCE_STRICT=1
 * 时把失败语义翻转为 fail-closed——无任何策略配置 → 拒（strict-deny）；裁决面内部
 * 异常 → 拒。默认不变（仍是 opt-in + fail-open，2026-10-16 整改方案 v2「零阻断
 * 先预警」裁定原样保留）。对齐微软 Agent Governance Toolkit「策略没加载时默认
 * allow 是假 governed」的批评：strict 是唯一能防住该静默失效的配置方式。
 */
import { ladderForProfile, type AutonomyLadderEntry } from '../autonomyladder/autonomy-ladder'
import { classifyApprovalRisk, type ApprovalRiskTier } from '../approval-inbox/risk-tier'
import { browserVerdict } from '../browsersec/browser-security'
import { modeDecision, type PermissionMode, type ToolCategory } from '../permmodes/permission-modes'
import { sessionModeOf } from '../permmodes/session-mode-store'
import { appendPolicyDecision } from './policy-decisions'
import { evaluatePolicy, type PolicySnapshot, type PolicyToolCategory } from '../toolpolicy/tool-policy'
import { loadPolicySnapshot } from '../toolpolicy/policy-store'
import { proactivityPolicyForProfile, type ProactivityPolicyLite } from '../proactivity/enforcement-policy'
import { assess } from '../proactivity/proactivity-model'
import { loadManagedSettings } from '../managedsettings/managed-settings'
// P0 Task 5：执行契约单一事实源（未知 MCP 判定 + 真实路径沙箱 + OS 沙箱证明）。
// P1 Task 1：osSandboxProofActive 升格为 osSandboxAttestation（声明+探测信号+declaredOnly
// 观测标记）；sandboxPathViolation 增第三返回形态 skippedNoContext（无基准相对路径
// 不再静默）——两者均由本模块落 govbus 事件，判定语义不变。
import {
  isUnknownMcpTool,
  mcpCategoryOf,
  osSandboxAttestation,
  parseEnvList,
  sandboxPathViolation,
  sandboxRootsConfigured,
} from '../../platform/contracts/execution'
import type { OsSandboxAttestation, OsSandboxProbeSignals, SandboxPathContext } from '../../platform/contracts/execution'
// 旧导入面保持（P0-5 前消费者直接从本模块导入这些符号；P1-1 起 osSandboxProofActive
// 全仓唯一消费方即本模块，已随升格改名——无外部调用方需要过渡别名）
export { isUnknownMcpTool, mcpCategoryOf, osSandboxAttestation, sandboxPathViolation, sandboxRootsConfigured }
export type { OsSandboxAttestation, OsSandboxProbeSignals, SandboxPathContext }

/** ekko ToolExecuteHook 形状（结构化类型，不 import 上游——toolresultguard 同款先例）。
 *  context 字段面=上游 AgentToolContext 的子集（vendor ekko-agent tools/types.ts）；
 *  cwd/workspaceRoot 为 P0 Task 5 增补——沙箱路径判定需要真实执行基准。 */
interface PreExecuteVerdict { allow: false; error: string }
interface StructuralToolHook {
  preExecute?: (name: string, input: Record<string, unknown>, context?: {
    profileId?: string
    userId?: string
    sessionId?: string
    runId?: string
    cwd?: string
    workspaceRoot?: string
  }) => Promise<PreExecuteVerdict | void> | PreExecuteVerdict | void
}

export type EnforceRule =
  | 'master-off'            // 总闸未开（不执法）
  | 'no-config'             // 无阶梯无全局模式（不执法）
  | 'identity-pass'         // 身份白名单放行（无阶梯/模式时的唯一执法层）
  | 'identity-tool-denied'  // 身份工具白名单未覆盖
  | 'policy-allow'          // 声明式策略显式 allow 命中
  | 'policy-pass'           // 声明式策略 permissive 未命中（继续既有链）
  | 'policy-deny'           // 声明式策略 deny 命中
  | 'policy-strict-default' // strict 模式未命中任何 allow（deny-by-default）
  | 'policy-require-approval' // 声明式策略要求人工审批
  | 'policy-error'          // 策略文件损坏/校验失败（fail-closed）
  | 'ladder-pass'           // 阶梯判定放行
  | 'mode-pass'             // 全局模式判定放行
  | 'ladder-insight-readonly' // insight 档遇非 read 工具
  | 'ladder-approval-point'  // assist 档命中人工确认点
  | 'ladder-risk-cap'        // 风险超阶梯 maxRiskTier
  | 'mode-off'               // 全局模式矩阵判 OFF
  | 'mode-needs-approval'    // 全局模式矩阵判 RA（需审批，v1 无交互桥→拒并指引）
  | 'approval-passed'        // 审批桥放行（批单在案且未消费，consume-on-pass；applyApprovalBridge 终态）
  | 'strict-deny'            // strict 模式无任何策略配置（deny-by-default；AGT 吸收轮 F）
  | 'proactivity-inform-only' // 两轴 L5（推断目标）非观察面（挂账清偿批 H4）
  | 'proactivity-draft-cap'   // 两轴 L4 无契约上限起草（可走审批桥——人核即起草语义闭环）
  | 'proactivity-goal-drift'  // 两轴目标漂移防线（L4 目标 stale/未确认——须重新确认目标，非批单可豁免）
  | 'managed-deny'          // 组织托管配置的 extraDeniedTools 命中（D1 2026-11-05）
  | 'sandbox-path'           // 显式路径超出沙箱根（P2-5；P0-5 起真实路径判定）
  | 'sandbox-network'        // 浏览器 URL 被网络策略拒绝（P2-5）
  | 'sandbox-terminal-unavailable' // 沙箱模式下 terminal/code 无真实 OS 沙箱证明（P0-5；不可审批放行）
  | 'mcp-unknown'            // 未知 MCP 工具动词启发式判不出类别（P0-5；不可审批放行）
  | 'budget-exceeded'        // 当日预算耗尽且策略动作为 block（残余项⑤）

/** 策略层透传元数据：决策账/审批单据此回答「当时生效的是哪条策略」。 */
export interface EnforcePolicyMeta {
  policyRuleId?: string
  policyMode?: 'strict' | 'permissive'
}

export type EnforceVerdict =
  | ({ enforcing: false; rule: Extract<EnforceRule, 'master-off' | 'no-config'> } & EnforcePolicyMeta)
  | ({ enforcing: true; allow: true; rule: Extract<EnforceRule, 'identity-pass' | 'policy-allow' | 'policy-pass' | 'ladder-pass' | 'mode-pass' | 'approval-passed'> } & EnforcePolicyMeta)
  | ({ enforcing: true; allow: false; rule: Exclude<EnforceRule, 'master-off' | 'no-config' | 'identity-pass' | 'policy-allow' | 'policy-pass' | 'ladder-pass' | 'mode-pass' | 'approval-passed'>; error: string } & EnforcePolicyMeta)

// ---------- 工具类别映射（permmodes 四类口径） ----------

const READ_TOOLS = new Set([
  'read_file', 'view_image', 'memory_search', 'memory_get', 'skill_list', 'skill_view',
  'browser_navigate', 'browser_snapshot', 'browser_get_images', 'browser_vision',
  'browser_console', 'browser_back', 'update_plan', 'clarify',
  'ekko_diagnostics', 'ekko_database_schema', 'ekko_self_check', 'ekko_repair_logs',
])
const WRITE_TOOLS = new Set(['write_file', 'memory_write', 'memory_forget', 'skill_manage', 'ekko_repair_skills'])
const EXEC_TOOLS = new Set(['terminal_exec', 'code_exec'])
// 网络动作类：浏览器交互（改变外部站点状态）与委托（派生不可控执行面）
const NETWORK_TOOLS = new Set(['browser_click', 'browser_type', 'browser_press', 'browser_scroll', 'delegate_task'])

export function toolCategoryOf(tool: string): ToolCategory {
  if (READ_TOOLS.has(tool)) return 'read'
  if (WRITE_TOOLS.has(tool)) return 'write'
  if (EXEC_TOOLS.has(tool)) return 'exec'
  if (NETWORK_TOOLS.has(tool)) return 'network'
  return mcpCategoryOf(tool) ?? 'write'  // MCP 细分类（H3 剩余项③）；非 MCP 未知工具仍保守 write
}

// MCP 工具细分类（mcpCategoryOf/isUnknownMcpTool）已迁至平台执行契约
// custom/platform/contracts/execution.ts（P0 Task 5 单一事实源）：
//   - 分类只看动词启发式一层（连接器只读目录两分支等价，已删——审查 M-1）；
//   - 动词判不出 → 未知（null），不再默认 read；
//   - 未知 MCP 由 evaluateEnforcement 的 mcp-unknown 硬拒（先于身份链与审批桥）。
// 本模块 re-export 保持旧导入面（见文件头 import 段）。

// ---------- 风险分档（复用审批域单一事实源） ----------

const RISK_RANK: Record<ApprovalRiskTier, number> = { low: 0, medium: 1, high: 2 }

export function riskOfCall(tool: string, input: Record<string, unknown>): ApprovalRiskTier {
  if (toolCategoryOf(tool) === 'read') return 'low'
  if (tool === 'terminal_exec') {
    const cmd = typeof input.command === 'string' ? input.command : ''
    return classifyApprovalRisk({ kind: 'command', detail: cmd })
  }
  if (tool === 'code_exec') {
    const src = `${input.language ?? ''} ${input.code ?? input.source ?? ''}`
    return classifyApprovalRisk({ kind: 'command', detail: String(src) })
  }
  return 'medium'  // 写/网络/未知：可逆常规档（保守不低判）
}

/** 调用可检索文本（确认点匹配用；不落日志）。 */
function callTextOf(tool: string, input: Record<string, unknown>): string {
  const vals: string[] = []
  for (const v of Object.values(input ?? {})) {
    if (typeof v === 'string') vals.push(v)
    else if (typeof v === 'number' || typeof v === 'boolean') vals.push(String(v))
  }
  return `${tool} ${vals.join(' ')}`.slice(0, 2000)
}

/** assist 档确认点命中：确认点字面 ⊆ 调用文本（大小写不敏感），或调用本身高危。
 *  v1 语义：高危调用在 assist 档恒需确认（BCG"关键步人工确认"的保守读法）。 */
export function approvalPointHit(ladder: AutonomyLadderEntry, tool: string, input: Record<string, unknown>): string | null {
  const text = callTextOf(tool, input).toLowerCase()
  for (const point of ladder.approvalPoints) {
    if (point.trim() && text.includes(point.trim().toLowerCase())) return point
  }
  if (riskOfCall(tool, input) === 'high') return '(高危调用)'
  return null
}

// ---------- 两轴策略源（挂账清偿批 H4，proactivity 域消费） ----------

/** 两轴限制裁决（纯函数）：read 类=观察面恒放行（L5 告知也要能看，D2）；
 *  非 read 按风险档映射纵轴（high→irreversible_exec，其余→reversible_exec），
 *  复用 proactivity-model.assess() 单一事实源。返回 null=两轴不限制。 */
export function proactivityRestriction(
  tool: string,
  input: Record<string, unknown>,
  policy: ProactivityPolicyLite,
): { rule: 'proactivity-inform-only' | 'proactivity-draft-cap' | 'proactivity-goal-drift'; error: string } | null {
  const category = toolCategoryOf(tool)
  if (category === 'read') return null
  const action = riskOfCall(tool, input) === 'high' ? 'irreversible_exec' : 'reversible_exec'
  const verdict = assess({
    level: policy.level,
    action,
    ...(policy.contract ? { contract: policy.contract } : {}),
    ...(policy.goalStatus ? { goalStatus: policy.goalStatus } : {}),
  })
  if (verdict.allowed) return null
  const reason = verdict.reasons.join('；')
  if (policy.level === 'L5') {
    return {
      rule: 'proactivity-inform-only',
      error: `两轴裁决 L5（推断目标）只告知：工具 ${tool} 属 ${category} 类（非观察面）——${reason}`,
    }
  }
  if (policy.goalStatus && policy.goalStatus !== 'fresh') {
    return {
      rule: 'proactivity-goal-drift',
      error: `两轴裁决目标漂移防线：工具 ${tool}（${category} 类）被压回起草——${reason}。请先在目标对齐台账重新确认目标（PUT /api/hermes/proactivity/alignment/<goalId>/confirm），审批单不可豁免漂移防线`,
    }
  }
  return {
    rule: 'proactivity-draft-cap',
    error: `两轴裁决 L4 无契约上限起草：工具 ${tool} 属 ${category} 类——${reason}。可走审批（人核后放行=起草待确认语义）或补目标契约（说清目标+验收规则）升仓`,
  }
}

// ---------- 裁决核心（纯函数，测试面） ----------

/** 身份最小面（agentidentity 的投影；不 import 存储，保持纯函数可测）。 */
export interface IdentityLite {
  id: string
  name: string
  /** 身份自身工具白名单（空=未声明）。 */
  toolAllowlist: string[]
  /** 活跃委托的结构化工具白名单并集（空=无结构化委托）。 */
  delegationAllowlist?: string[]
}

export interface EnforceEnv {
  masterOn?: boolean
  /** strict 姿态（HERMES_TOOL_ENFORCE_STRICT=1）：无配置/异常 → 拒。 */
  strictOn?: boolean
  globalMode?: PermissionMode | null
  /** 会话档取值（v4 通道轮）：per-profile 会话权限档，优先于全局档、让位于阶梯。 */
  sessionModeOf?: (profileId?: string) => PermissionMode | null
  ladderOf?: (profileId?: string) => AutonomyLadderEntry | null
  /** 发起用户（ekko context.userId）；无身份记录时不影响既有裁决。 */
  userId?: string
  identityOf?: (userId?: string) => IdentityLite | null
  /** 预算已耗尽且策略动作为 block（由钩子在 HERMES_BUDGET_ENFORCE=1 时预计算）。 */
  budgetBlocked?: boolean
  /** 声明式策略快照注入（测试用；缺省读 policy-store，带 1s 缓存）。null=未配置。 */
  policyOf?: () => PolicySnapshot | null
  /** 两轴策略总闸（HERMES_PROACTIVITY_ENFORCE=1；缺省读 env）。 */
  proactivityOn?: boolean
  /** 两轴策略注入（测试用；缺省读 proactivity/enforcement-policy，异常 fail-open）。 */
  proactivityOf?: (profileId?: string) => ProactivityPolicyLite | null
  /** 真实执行上下文（P0-5）：沙箱路径判定的相对路径解析基准（上游 AgentToolContext
   *  的 cwd/workspaceRoot，由执法钩子透传；测试直接注入）。 */
  sandboxContext?: SandboxPathContext
  /** OS 沙箱证明 attestation 注入（P1 Task 1：测试确定性——真实探测信号依宿主
   *  macOS/Linux/容器而异；缺省走 osSandboxAttestation() 真实探测）。 */
  osAttestationOf?: () => OsSandboxAttestation
}

/** 工具白名单匹配：精确名或 `prefix*`。 */
export function toolAllowedByList(tool: string, list: string[]): boolean {
  return list.some((raw) => {
    const pattern = String(raw ?? '').trim()
    if (!pattern) return false
    return pattern.endsWith('*') ? tool.startsWith(pattern.slice(0, -1)) : tool === pattern
  })
}

// 沙箱路径检查（sandboxPathViolation）已迁至平台执行契约 execution.ts（P0 Task 5：
// 相对路径按真实 cwd/workspaceRoot 解析、realpathSync.native canonicalize、symlink
// 逃逸/不可规范化 fail-closed）。本模块 re-export 保持旧导入面。
// D1 2026-11-05 的「exec 相对路径按 cwd 解析后再判」补强由契约的 context 解析语义
// 覆盖并收紧（真实执行 cwd/workspaceRoot 基准 + canonical 判定取代入参 cwd 猜测），
// 不保留并行实现——路径判定单一事实源在 contracts/execution.ts。

const URL_KEYS = ['url', 'href', 'link', 'target_url', 'navigate_to']

/** 浏览器 URL 检查：配置了 allow/deny 才生效；denylist 优先（browsersec 语义）。 */
export function sandboxNetworkViolation(tool: string, input: Record<string, unknown>): string | null {
  if (!tool.startsWith('browser_') && tool !== 'delegate_task') return null
  const allow = parseEnvList('HERMES_BROWSER_ALLOWLIST')
  const deny = parseEnvList('HERMES_BROWSER_DENYLIST')
  if (allow.length === 0 && deny.length === 0) return null
  let url: string | null = null
  for (const key of URL_KEYS) {
    const v = input[key]
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) { url = v; break }
  }
  // 没有 URL 的浏览器动作（click/press）无法在裁决层判定目标域，交给独立 profile 隔离。
  if (!url) return null
  const decision = browserVerdict(url, { allowlist: allow, denylist: deny, isolatedProfile: true })
  return decision.verdict === 'deny' ? `${url}（${decision.reason}）` : null
}

/** 总闸判定（D1 2026-11-05）：managed-settings 锁定 > env 显式 0 关 > 默认开。
 *  独立函数便于 doctor/评分卡/测试同口径消费。 */
export function masterSwitchOn(): boolean {
  const managed = loadManagedSettings()
  if (managed && managed.toolEnforceLocked) return managed.toolEnforce === 1
  return process.env.HERMES_TOOL_ENFORCE !== '0'
}

export function evaluateEnforcement(
  tool: string,
  input: Record<string, unknown>,
  profileId: string | undefined,
  env: EnforceEnv = {},
): EnforceVerdict {
  const masterOn = env.masterOn ?? masterSwitchOn()
  if (!masterOn) return { enforcing: false, rule: 'master-off' }

  // 策略链 -1（D1 2026-11-05）：组织托管 extraDeniedTools——优先于一切（含 P0-5 硬边界
  // 与部署侧策略文件），组织级禁用面不可被用户策略放宽（Claude Code managed-settings
  // 同语义）。
  const managed = loadManagedSettings()
  if (managed?.extraDeniedTools?.length) {
    const hit = managed.extraDeniedTools.some((p) => (p.endsWith('*') ? tool.startsWith(p.slice(0, -1)) : p === tool))
    if (hit) {
      return {
        enforcing: true, allow: false, rule: 'managed-deny',
        error: `工具 ${tool} 被组织托管配置禁用（${managed._source}）——用户/项目级配置不可放宽`,
      }
    }
  }

  // 硬边界（P0 Task 5，先于身份链与审批桥——身份 allowlist 与批单都不能豁免）：
  // 未知 MCP 工具判不出类别=平台未评估的风险面。修复出口是补动词映射/登记连接器，
  // 不是审批；已知动词（read/write/exec）不受影响。
  if (isUnknownMcpTool(tool)) {
    return {
      enforcing: true, allow: false, rule: 'mcp-unknown',
      error: `未知 MCP 工具 ${tool}：动词启发式判不出类别，平台无法评估其风险面——请为该连接器登记动词映射或改用已治理工具（本拒绝不可经审批放行）`,
    }
  }

  // 沙箱硬边界（P2-5，opt-in）：未配置根 = 不检查，不假装有沙箱。P0-5 起判定走
  // 真实路径（相对路径按上下文 cwd/workspaceRoot 解析、realpath canonicalize）。
  // P1 Task 1：无基准相对路径返回 skippedNoContext 标记——放行但落观测事件。
  const pathViolation = sandboxPathViolation(tool, input, undefined, env.sandboxContext)
  if (typeof pathViolation === 'string') {
    return {
      enforcing: true, allow: false, rule: 'sandbox-path',
      error: `路径 ${pathViolation} 超出沙箱根或沙箱根不可规范化（HERMES_TOOL_SANDBOX_ROOTS）——请改到允许目录或修正沙箱根配置`,
    }
  }
  if (pathViolation) {
    emitNoContextPathEvent(tool, profileId)
  }

  // 硬边界（P0 Task 5）：沙箱模式（roots 已配置）下 terminal/code 本质上能触达任意
  // 路径（cd/重定向），路径白名单管不住 shell——没有真实 OS 沙箱证明即拒，不用
  // Shell 文本检查代替（计划书全局约束）。证明口径见 contracts/execution.ts。
  // P1 Task 1：证明升格 attestation——declared 解锁不变；declaredOnly（声明无探测
  // 佐证）解锁时落 autonomy 观测事件，提示核实声明真实性（不影响裁决）。
  if ((tool === 'terminal_exec' || tool === 'code_exec') && sandboxRootsConfigured()) {
    const attestation = (env.osAttestationOf ?? osSandboxAttestation)()
    if (!attestation.declared) {
      return {
        enforcing: true, allow: false, rule: 'sandbox-terminal-unavailable',
        error: `工具 ${tool} 在沙箱模式（HERMES_TOOL_SANDBOX_ROOTS 已配置）下缺少真实 OS 沙箱证明（HERMES_TOOL_OS_SANDBOX_PROOF=container|vm|seatbelt）——路径白名单管不住 shell，请将 agent 运行时置于真实 OS 级隔离或声明证明（本拒绝不可经审批放行）`,
      }
    }
    if (attestation.declaredOnly) {
      emitSandboxAttestationEvent(tool, profileId, attestation)
    }
  }

  // 策略链 0（P0-1）：发起用户身份白名单。仅当身份已登记且声明了 allowlist 才执法；
  // 未登记/空 allowlist=未声明，不改变既有行为（不把“没登记”当“已治理”）。
  const identity = env.identityOf?.(env.userId) ?? null
  const hasOwnAllowlist = !!identity && identity.toolAllowlist.length > 0
  const hasDelegationAllowlist = !!identity && (identity.delegationAllowlist?.length ?? 0) > 0
  const identityEnforced = hasOwnAllowlist || hasDelegationAllowlist
  if (identity && identityEnforced) {
    // 双清单同时校验：身份 allowlist 与活跃委托范围都放行才算通过（委托只能收窄）。
    const ownOk = !hasOwnAllowlist || toolAllowedByList(tool, identity.toolAllowlist)
    const delegatedOk = !hasDelegationAllowlist || toolAllowedByList(tool, identity.delegationAllowlist ?? [])
    if (!ownOk || !delegatedOk) {
      const missing = !ownOk ? '身份 allowlist' : '活跃委托范围'
      return {
        enforcing: true, allow: false, rule: 'identity-tool-denied',
        error: `身份 ${identity.name}（${identity.id}）的${missing}未覆盖 ${tool}——请登记该工具或由属主调整 allowlist/委托范围`,
      }
    }
  }

  const networkViolation = sandboxNetworkViolation(tool, input)
  if (networkViolation) {
    return {
      enforcing: true, allow: false, rule: 'sandbox-network',
      error: `浏览器目标 ${networkViolation} 被网络策略拒绝（HERMES_BROWSER_ALLOWLIST/DENYLIST）`,
    }
  }
  if (env.budgetBlocked) {
    return {
      enforcing: true, allow: false, rule: 'budget-exceeded',
      error: '当日预算已耗尽（HERMES_BUDGET_ENFORCE=1 且策略动作 block）——请等待次日额度或调整预算策略',
    }
  }
  // 策略链 0.5（2026-10-21 AGT 调研轮）：声明式工具策略。硬边界（身份/沙箱/预算）
  // 之后、粗粒度默认档（阶梯/权限模式）之前——策略只收紧，不放宽既有边界；
  // strict 的 deny-by-default 是额外一道门，allow 命中后仍继续走阶梯/模式。
  const policySnap = (env.policyOf ?? (() => loadPolicySnapshot()))()
  const policyActive = !!policySnap?.exists
  let policyMeta: EnforcePolicyMeta = {}
  if (policySnap && policySnap.exists) {
    const pv = evaluatePolicy(policySnap, {
      tool,
      category: toolCategoryOf(tool) as PolicyToolCategory,
      input,
      userId: env.userId,
      profileId,
    })
    if (pv.status === 'error') {
      // 配置坏了 ≠ 没配置：fail-closed，并给出可修复的原因（不静默放行）。
      return { enforcing: true, allow: false, rule: 'policy-error', error: pv.reason }
    }
    if (pv.status === 'deny') {
      return {
        enforcing: true, allow: false,
        rule: pv.ruleId ? 'policy-deny' : 'policy-strict-default',
        error: pv.reason,
        ...(pv.ruleId ? { policyRuleId: pv.ruleId } : {}),
        policyMode: pv.mode,
      }
    }
    if (pv.status === 'require_approval') {
      return {
        enforcing: true, allow: false, rule: 'policy-require-approval',
        error: `${pv.reason}——批准后重试即放行（一单一执行）`,
        policyRuleId: pv.ruleId,
        policyMode: pv.mode,
      }
    }
    if (pv.status === 'allow') {
      policyMeta = { ...(pv.ruleId ? { policyRuleId: pv.ruleId } : {}), policyMode: pv.mode }
    }
  }

  // 策略链 0.7（挂账清偿批 H4）：两轴策略（proactivity 域）。只收紧不放宽——
  // 硬边界（身份/沙箱/预算/声明式策略）之后、粗粒度阶梯/模式之前。独立总闸
  // HERMES_PROACTIVITY_ENFORCE=1（默认 0=零行为变化）且该 profile 配了两轴
  // 策略才执法；缺配置/内部异常一律不拦（不装已治理）。
  const proactOn = env.proactivityOn ?? (process.env.HERMES_PROACTIVITY_ENFORCE === '1')
  if (proactOn) {
    const policy = (env.proactivityOf ?? ((p?: string) => proactivityPolicyForProfile(p ?? '')))(profileId)
    if (policy) {
      const restriction = proactivityRestriction(tool, input, policy)
      if (restriction) {
        return { enforcing: true, allow: false, ...restriction, ...policyMeta }
      }
    }
  }

  // 档位解析三级链（阶梯＞会话档＞全局档）：会话档 per-profile 更具体故恒胜全局档
  // （v4 通道轮）；全局档=env 注入位（测试用 globalMode / 运行用 HERMES_TOOL_ENFORCE_MODE）。
  const sessionMode = env.sessionModeOf !== undefined
    ? env.sessionModeOf(profileId)
    : sessionModeOf(profileId ?? '')
  const globalRaw = env.globalMode !== undefined
    ? env.globalMode
    : (process.env.HERMES_TOOL_ENFORCE_MODE as PermissionMode | undefined ?? null)
  const modeRaw = sessionMode ?? globalRaw
  const modeSource = sessionMode ? '会话档' : '全局档'
  const ladder = (env.ladderOf ?? ((p?: string) => ladderForProfile(p ?? '')))(profileId)
  if (!ladder && !modeRaw) {
    // 身份白名单/策略是唯一执法层时，放行也要如实标 enforcement=true（否则审计看不到裁决）。
    if (policyActive) {
      return {
        enforcing: true, allow: true,
        rule: policyMeta.policyRuleId ? 'policy-allow' : 'policy-pass',
        ...policyMeta,
      }
    }
    // strict（AGT 吸收轮 F）：开了总闸却无任何策略 = 假治理面，strict 下拒。
    // 声明式策略已生效（policyActive）或身份白名单在执法时不算「无策略」，不误伤。
    if (!identityEnforced && (env.strictOn ?? (process.env.HERMES_TOOL_ENFORCE_STRICT === '1'))) {
      return {
        enforcing: true, allow: false, rule: 'strict-deny',
        error: 'strict 模式（HERMES_TOOL_ENFORCE_STRICT=1）：总闸已开但无任何策略配置（自治阶梯/权限模式/身份白名单/声明式策略均未配置）——deny-by-default，请配置策略或关闭 strict',
      }
    }
    return identityEnforced
      ? { enforcing: true, allow: true, rule: 'identity-pass' }
      : { enforcing: false, rule: 'no-config' }
  }

  // 策略链 1：自治阶梯（配置了阶梯则阶梯优先——更具体的 per-profile 约束胜出全局模式）
  if (ladder) {
    const category = toolCategoryOf(tool)
    if (ladder.level === 'insight') {
      if (category !== 'read') {
        return {
          enforcing: true, allow: false, rule: 'ladder-insight-readonly',
          error: `自治阶梯 insight 档（只出洞察）：工具 ${tool} 属 ${category} 类，非只读——请人执行或调整阶梯配置`,
          ...policyMeta,
        }
      }
      return { enforcing: true, allow: true, rule: 'ladder-pass', ...policyMeta }
    }
    const risk = riskOfCall(tool, input)
    if (RISK_RANK[risk] > RISK_RANK[ladder.maxRiskTier]) {
      return {
        enforcing: true, allow: false, rule: 'ladder-risk-cap',
        error: `自治阶梯 ${ladder.level} 档风险上限 ${ladder.maxRiskTier}：本次调用判定 ${risk}——超出允许档位`,
        ...policyMeta,
      }
    }
    if (ladder.level === 'assist') {
      const hit = approvalPointHit(ladder, tool, input)
      if (hit) {
        return {
          enforcing: true, allow: false, rule: 'ladder-approval-point',
          error: `自治阶梯 assist 档命中人工确认点「${hit}」——请人工确认后在审批流放行，或调整该 profile 的确认点配置`,
          ...policyMeta,
        }
      }
    }
    return { enforcing: true, allow: true, rule: 'ladder-pass', ...policyMeta }
  }

  // 策略链 2：全局权限模式（七档矩阵）
  const mode = modeRaw as PermissionMode
  const decision = modeDecision(mode, toolCategoryOf(tool))
  if (!decision.allowed) {
    return {
      enforcing: true, allow: false, rule: 'mode-off',
      error: `权限模式 ${mode}（${modeSource}）不放行 ${toolCategoryOf(tool)} 类工具（${tool}）`,
      ...policyMeta,
    }
  }
  if (decision.needsApproval) {
    return {
      enforcing: true, allow: false, rule: 'mode-needs-approval',
      error: `权限模式 ${mode}（${modeSource}）对 ${toolCategoryOf(tool)} 类工具要求人工审批（${tool}）——请走审批流后重试，或下调该 profile 会话档`,
      ...policyMeta,
    }
  }
  return { enforcing: true, allow: true, rule: 'mode-pass', ...policyMeta }
}

// ---------- 钩子（挂进 ekkoToolExecuteHooks） ----------

// ── H3 交互审批桥（2026-10-08 收口轮）──
// 只转"需人工确认"类拒绝（RA 档/阶梯确认点）；硬边界（OFF/风险上限/insight 只读）
// 不经桥——批单不越权。approved=同 callHash 批单在案且未消费（consume-on-pass）；
// ticket=挂单信息（deny 文案带单号指引批后重试）。
export const APPROVAL_CLASS_RULES: ReadonlySet<string> = new Set([
  'mode-needs-approval',
  'ladder-approval-point',
  'policy-require-approval',
  'proactivity-draft-cap',  // 两轴 L4 无契约：人核=「起草待确认」语义闭环（D3）
])

export function applyApprovalBridge(
  v: EnforceVerdict,
  bridge: { approved: boolean; ticket?: { id: string; status: 'pending' | 'approved' | 'rejected' } | null },
): EnforceVerdict {
  if (!(v.enforcing && v.allow === false) || !APPROVAL_CLASS_RULES.has(v.rule)) return v
  if (bridge.approved) return { ...v, allow: true, rule: 'approval-passed' }
  if (bridge.ticket?.status === 'rejected') {
    return { ...v, error: `${v.error}——审批单 ${bridge.ticket.id} 已被否决，请调整方案或降档后重试` }
  }
  const t = bridge.ticket ? `（审批单 ${bridge.ticket.id} 已挂入收件箱·执法审批区）` : ''
  return { ...v, error: `${v.error}——批准后重试即放行（一单一执行）${t}` }
}

/** 桥事实采集（钩子层副作用，异步动态 import——vitest ESM 下 require 会静默失败，前车之鉴）：
 *  approved=批单在案未消费（消费即真）；未批则挂单带回单号。仅确认类裁决调用方才采。 */
async function approvalBridgeFacts(
  tool: string,
  input: Record<string, unknown>,
  profileId: string | undefined,
  rule: string,
  policyRuleId?: string,
  identity?: { userId?: string; runId?: string },
): Promise<{ approved: boolean; callHash: string; ticket?: { id: string; status: 'pending' | 'approved' | 'rejected' } | null }> {
  try {
    const bridge = await import('./enforce-approvals')
    const hash = bridge.callHashOf(tool, input, profileId ?? '')
    if (bridge.consumeApprovalIfReady(hash)) return { approved: true, callHash: hash }
    const risk = riskOfCall(tool, input)
    const rec = bridge.createEnforceApproval({
      callHash: hash, tool,
      inputPreview: bridge.inputPreviewOf(input),
      profileId: profileId ?? '', rule,
      risk: risk === 'low' ? 'low' : risk === 'high' ? 'high' : 'medium',
      ...(policyRuleId ? { policyRuleId } : {}),
      // W2 审批口径：批单钉发起人与运行（裁决端据此禁自批）
      ...(identity?.userId ? { requestedBy: identity.userId } : {}),
      ...(identity?.runId ? { runId: identity.runId } : {}),
    })
    return { approved: false, callHash: hash, ticket: { id: rec.id, status: rec.status } }
  } catch {
    return { approved: false, callHash: '' } // 桥面故障=无单可指（裁决仍拒，不 fail-open 放行）
  }
}

/** 挂起/续跑/超时留痕（govbus approval 域——审批链路事实，与 deny 的 security 域分面）。 */
function emitSuspendEvent(tool: string, profileId: string | undefined, ticketId: string, phase: 'suspend' | 'resume' | 'timeout'): void {
  import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      appendGovEvent({
        domain: 'approval',
        severity: phase === 'timeout' ? 'warn' : 'info',
        type: `tool.enforce_${phase}`,
        source: 'toolpipeline/enforce-gate',
        summary: phase === 'suspend'
          ? `执法门挂起 ${profileId ? `profile ${profileId} 的 ` : ''}工具调用 ${tool}（审批单 ${ticketId}，瀑布级等待）`
          : phase === 'resume'
            ? `审批通过自动续跑：${profileId ? `profile ${profileId} 的 ` : ''}工具调用 ${tool}（审批单 ${ticketId}）`
            : `审批等待超时（单 ${ticketId} 留收件箱）：${profileId ?? ''} ${tool}`,
        refs: profileId ? { profileId, ticketId } : { ticketId },
        payload: { tool, ticketId, phase },
      })
    })
    .catch(() => { /* fail-soft */ })
}

function emitDenyEvent(tool: string, profileId: string | undefined, v: Extract<EnforceVerdict, { enforcing: true; allow: false }>): void {
  import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      appendGovEvent({
        domain: 'security',
        severity: 'high',
        type: `tool.denied_${v.rule}`,
        source: 'toolpipeline/enforce-gate',
        summary: `执法门拒绝 ${profileId ? `profile ${profileId} 的 ` : ''}工具调用 ${tool}：${v.error}`,
        refs: profileId ? { profileId } : {},
        payload: { tool, rule: v.rule, ...(v.policyRuleId ? { policyRuleId: v.policyRuleId } : {}) },
      })
    })
    .catch(() => { /* fail-soft */ })
}

/** P1 Task 1（终审前置①）：terminal 解锁但 OS 沙箱证明「仅声明无探测佐证」→
 *  autonomy/warn 观测事件（fire-and-forget 同 permmodes session-mode 先例）。
 *  不改变裁决——declared 已满足证明口径，事件只提示部署者核实声明真实性。 */
function emitSandboxAttestationEvent(tool: string, profileId: string | undefined, attestation: OsSandboxAttestation): void {
  import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      appendGovEvent({
        domain: 'autonomy',
        severity: 'warn',
        type: 'sandbox-attestation-declared-only',
        source: 'toolpipeline/enforce-gate',
        summary: `沙箱证明仅声明无探测佐证：${profileId ? `profile ${profileId} 的 ` : ''}工具 ${tool} 已按声明解锁，但 /.dockerenv、cgroup 容器标记、sandbox-exec 三项探测无一命中——请核实 HERMES_TOOL_OS_SANDBOX_PROOF 声明与实际运行环境一致`,
        refs: profileId ? { profileId } : {},
        payload: { tool, declared: attestation.declared, declaredOnly: attestation.declaredOnly, probeSignals: attestation.probeSignals },
      })
    })
    .catch(() => { /* fail-soft */ })
}

/** P1 Task 1（终审前置②）：ROOTS 配置但相对路径无解析基准（cwd/workspaceRoot 缺席）
 *  → sandbox/info 观测事件。只加可见性不断言拒（fail-closed 留 P2 执行面统一）。 */
function emitNoContextPathEvent(tool: string, profileId: string | undefined): void {
  import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      appendGovEvent({
        domain: 'sandbox',
        severity: 'info',
        type: 'relative-path-no-context',
        source: 'toolpipeline/enforce-gate',
        summary: `相对路径无解析基准：${profileId ? `profile ${profileId} 的 ` : ''}工具 ${tool} 的沙箱路径检查跳过并放行（cwd/workspaceRoot 缺席，判定不猜）——请透传执行上下文或改用绝对路径`,
        refs: profileId ? { profileId } : {},
        payload: { tool },
      })
    })
    .catch(() => { /* fail-soft */ })
}

/** 身份台账缓存（5s）：工具调用高频，不每次读盘；台账变更最多延迟 5s 生效。
 *  strict 开启时台账不可用按裁决异常处理（抛出→钩子层 fail-closed 拒）。 */
let identityCache: { at: number; list: IdentityLite[] } | null = null

async function identityOfUser(userId?: string, strict = false): Promise<IdentityLite | null> {
  if (!userId) return null
  if (!identityCache || Date.now() - identityCache.at > 5_000) {
    try {
      const { listIdentities, activeDelegationToolAllowlist } = await import('../agentidentity/agent-identity')
      identityCache = {
        at: Date.now(),
        list: listIdentities().map((i) => ({
          id: i.id,
          name: i.name,
          toolAllowlist: i.toolAllowlist,
          delegationAllowlist: activeDelegationToolAllowlist(i),
        })),
      }
    } catch {
      if (strict) throw new Error('身份台账不可用（strict 模式按裁决异常处理）')
      return null // 台账不可用=不按身份执法（fail-open，与既有未配置语义一致）
    }
  }
  return identityCache.list.find((i) => i.id === userId || i.name === userId) ?? null
}

function logPolicyDecision(
  tool: string,
  input: Record<string, unknown>,
  context: { profileId?: string; userId?: string; sessionId?: string; runId?: string } | undefined,
  verdict: EnforceVerdict,
): void {
  if (!verdict.enforcing) return
  appendPolicyDecision({
    tool,
    userId: context?.userId,
    profileId: context?.profileId,
    sessionId: context?.sessionId,
    runId: context?.runId,
    enforcing: true,
    allow: verdict.allow,
    rule: verdict.rule,
    ...(verdict.policyRuleId ? { policyRuleId: verdict.policyRuleId } : {}),
    risk: riskOfCall(tool, input),
    reason: verdict.allow === false ? verdict.error.slice(0, 200) : undefined,
  })
}

/** 执法钩子（H3 v1）：preExecute 裁决。拒绝时 govbus 留痕 + 审计账 deny 条目。 */
export function ekkoEnforceGateHook(): StructuralToolHook {
  return {
    async preExecute(name: string, input: Record<string, unknown>, context?: {
      profileId?: string; userId?: string; sessionId?: string; runId?: string
      cwd?: string; workspaceRoot?: string
    }) {
      let verdict: EnforceVerdict
      let bridgeFacts: Awaited<ReturnType<typeof approvalBridgeFacts>> | null = null
      const strictOn = process.env.HERMES_TOOL_ENFORCE_STRICT === '1'
      try {
        const identity = await identityOfUser(context?.userId, strictOn)
        let budgetBlocked = false
        if (process.env.HERMES_BUDGET_ENFORCE === '1') {
          try {
            const budget = await import('../tokenbudget/budget-policy')
            budgetBlocked = budget.budgetBlocked({ userId: context?.userId, profileId: context?.profileId })
          } catch { /* 预算策略不可用=不阻断（fail-soft） */ }
        }
        verdict = evaluateEnforcement(name, input, context?.profileId, {
          userId: context?.userId,
          identityOf: () => identity,
          budgetBlocked,
          strictOn,
          // P0-5：透传真实执行上下文（上游 AgentToolContext 已携带，registry 直传到钩子）
          sandboxContext: context ? { cwd: context.cwd, workspaceRoot: context.workspaceRoot } : undefined,
        })
        // 审批桥只对确认类裁决采事实（避免给硬边界/放行类挂单）
        if (verdict.enforcing && verdict.allow === false && APPROVAL_CLASS_RULES.has(verdict.rule)) {
          bridgeFacts = await approvalBridgeFacts(name, input, context?.profileId, verdict.rule, verdict.policyRuleId, { userId: context?.userId, runId: context?.runId })
          verdict = applyApprovalBridge(verdict, bridgeFacts)
        }
      } catch (err) {
        // strict（AGT 吸收轮 F）：裁决面异常 fail-closed 拒，不再无条件放行。
        if (strictOn) {
          const msg = err instanceof Error ? err.message : String(err)
          return { allow: false as const, error: `执法面异常且 strict 模式开启（fail-closed）：${msg}` }
        }
        return  // fail-open：裁决面异常不拦截（桥面异常在助手内吞——裁决仍拒，不因桥坏放行）
      }
      // ── 瀑布级挂起（H3 理想形态）：确认类+单在 pending+挂起开启 → 调用原地等待；
      //    批准→consume→放行续跑（工具此刻执行，agent 无需重试）；否决/超时→拒（超时单留）。
      //    瀑布 await preExecute 无超时（patch 565 实证）——挂起即真挂起。
      if (
        bridgeFacts && !bridgeFacts.approved &&
        bridgeFacts.ticket?.status === 'pending' &&
        verdict.enforcing && verdict.allow === false &&
        process.env.HERMES_ENFORCE_SUSPEND !== '0'
      ) {
        const ap = await import('./enforce-approvals')
        emitSuspendEvent(name, context?.profileId, bridgeFacts.ticket.id, 'suspend')
        const outcome = await ap.waitEnforceDecision(bridgeFacts.callHash)
        if (outcome === 'approved' && ap.consumeApprovalIfReady(bridgeFacts.callHash)) {
          emitSuspendEvent(name, context?.profileId, bridgeFacts.ticket.id, 'resume')
          logPolicyDecision(name, input, context, { enforcing: true, allow: true, rule: 'approval-passed' })
          return // 批准即续跑：瀑布继续执行工具本体
        }
        if (outcome === 'approved') {
          verdict = { ...verdict, error: `审批单 ${bridgeFacts.ticket.id} 已被并发同调用消费——本次拒绝，重试将自动挂新单` }
        } else if (outcome === 'rejected') {
          verdict = { ...verdict, error: `审批单 ${bridgeFacts.ticket.id} 已被否决——调整方案或降档后重试` }
        } else {
          emitSuspendEvent(name, context?.profileId, bridgeFacts.ticket.id, 'timeout')
          verdict = { ...verdict, error: `审批等待超时（TTL=${Math.round(ap.suspendTtlMs() / 1000)}s）——审批单 ${bridgeFacts.ticket.id} 仍在收件箱，批准后重试即放行` }
        }
      }
      logPolicyDecision(name, input, context, verdict)
      if (verdict.enforcing && verdict.allow === false) {
        emitDenyEvent(name, context?.profileId, verdict)
        return { allow: false as const, error: verdict.error }
      }
      return
    },
  }
}
