/**
 * H3 v1 工具执行执法门（2026-10-08 六文调研轮 H3，BCG"按流程定义自治级别和决策
 * 边界"的执行面）。零新引擎 patch：patch 565 瀑布的 preExecute {allow:false} 拦截
 * 通道早已就绪，缺的只是 overlay 侧把"只观测"升级为"按策略裁决"——本模块即该裁决。
 *
 * 三级策略链（优先级从高到低，先命中先裁决）：
 *   1. 自治阶梯（autonomyladder，per profile / workflow:节点）：
 *      - insight 档：只放 read 类工具（只出洞察，人决策人执行）
 *      - assist 档：放行，但命中人工确认点或风险超 maxRiskTier → 拒
 *      - auto 档：放行，风险超 maxRiskTier → 拒
 *   2. 全局权限模式（HERMES_TOOL_ENFORCE_MODE，七档矩阵 permmodes）：
 *      矩阵判 OFF → 拒；判 RA → 视同 assist 的"需确认"（v1 无交互审批桥 → 拒并
 *      指引人走审批流；交互桥接见规格档 H3 待办）
 *   3. 无任何配置 → 放行（未配置不执法——诚实边界，不装已治理）
 *
 * 总闸 HERMES_TOOL_ENFORCE=1 才生效（默认 0=零行为变化，对齐 toolresultguard
 * 先例）；内部任何异常 fail-open；每次拒绝发 govbus security/high 事件留痕。
 */
import { ladderForProfile, type AutonomyLadderEntry } from '../autonomyladder/autonomy-ladder'
import { classifyApprovalRisk, type ApprovalRiskTier } from '../approvals/risk-tier'
import { modeDecision, type PermissionMode, type ToolCategory } from '../permmodes/permission-modes'

/** ekko ToolExecuteHook 形状（结构化类型，不 import 上游——toolresultguard 同款先例）。 */
interface PreExecuteVerdict { allow: false; error: string }
interface StructuralToolHook {
  preExecute?: (name: string, input: Record<string, unknown>, context?: { profileId?: string }) =>
    Promise<PreExecuteVerdict | void> | PreExecuteVerdict | void
}

export type EnforceRule =
  | 'master-off'            // 总闸未开（不执法）
  | 'no-config'             // 无阶梯无全局模式（不执法）
  | 'ladder-pass'           // 阶梯判定放行
  | 'mode-pass'             // 全局模式判定放行
  | 'ladder-insight-readonly' // insight 档遇非 read 工具
  | 'ladder-approval-point'  // assist 档命中人工确认点
  | 'ladder-risk-cap'        // 风险超阶梯 maxRiskTier
  | 'mode-off'               // 全局模式矩阵判 OFF
  | 'mode-needs-approval'    // 全局模式矩阵判 RA（需审批，v1 无交互桥→拒并指引）

export type EnforceVerdict =
  | { enforcing: false; rule: Extract<EnforceRule, 'master-off' | 'no-config'> }
  | { enforcing: true; allow: true; rule: Extract<EnforceRule, 'ladder-pass' | 'mode-pass'> }
  | { enforcing: true; allow: false; rule: Exclude<EnforceRule, 'master-off' | 'no-config' | 'ladder-pass' | 'mode-pass'>; error: string }

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
  return 'write'  // 未知工具（含 MCP 动态工具）按 write 保守归类（RA 默认档而非放行）
}

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

// ---------- 裁决核心（纯函数，测试面） ----------

export interface EnforceEnv {
  masterOn?: boolean
  globalMode?: PermissionMode | null
  ladderOf?: (profileId?: string) => AutonomyLadderEntry | null
}

export function evaluateEnforcement(
  tool: string,
  input: Record<string, unknown>,
  profileId: string | undefined,
  env: EnforceEnv = {},
): EnforceVerdict {
  const masterOn = env.masterOn ?? (process.env.HERMES_TOOL_ENFORCE === '1')
  if (!masterOn) return { enforcing: false, rule: 'master-off' }
  const modeRaw = env.globalMode !== undefined
    ? env.globalMode
    : (process.env.HERMES_TOOL_ENFORCE_MODE as PermissionMode | undefined ?? null)
  const ladder = (env.ladderOf ?? ((p?: string) => ladderForProfile(p ?? '')))(profileId)
  if (!ladder && !modeRaw) return { enforcing: false, rule: 'no-config' }

  // 策略链 1：自治阶梯（配置了阶梯则阶梯优先——更具体的 per-profile 约束胜出全局模式）
  if (ladder) {
    const category = toolCategoryOf(tool)
    if (ladder.level === 'insight') {
      if (category !== 'read') {
        return {
          enforcing: true, allow: false, rule: 'ladder-insight-readonly',
          error: `自治阶梯 insight 档（只出洞察）：工具 ${tool} 属 ${category} 类，非只读——请人执行或调整阶梯配置`,
        }
      }
      return { enforcing: true, allow: true, rule: 'ladder-pass' }
    }
    const risk = riskOfCall(tool, input)
    if (RISK_RANK[risk] > RISK_RANK[ladder.maxRiskTier]) {
      return {
        enforcing: true, allow: false, rule: 'ladder-risk-cap',
        error: `自治阶梯 ${ladder.level} 档风险上限 ${ladder.maxRiskTier}：本次调用判定 ${risk}——超出允许档位`,
      }
    }
    if (ladder.level === 'assist') {
      const hit = approvalPointHit(ladder, tool, input)
      if (hit) {
        return {
          enforcing: true, allow: false, rule: 'ladder-approval-point',
          error: `自治阶梯 assist 档命中人工确认点「${hit}」——请人工确认后在审批流放行，或调整该 profile 的确认点配置`,
        }
      }
    }
    return { enforcing: true, allow: true, rule: 'ladder-pass' }
  }

  // 策略链 2：全局权限模式（七档矩阵）
  const mode = modeRaw as PermissionMode
  const decision = modeDecision(mode, toolCategoryOf(tool))
  if (!decision.allowed) {
    return {
      enforcing: true, allow: false, rule: 'mode-off',
      error: `权限模式 ${mode} 不放行 ${toolCategoryOf(tool)} 类工具（${tool}）`,
    }
  }
  if (decision.needsApproval) {
    return {
      enforcing: true, allow: false, rule: 'mode-needs-approval',
      error: `权限模式 ${mode} 对 ${toolCategoryOf(tool)} 类工具要求人工审批（${tool}）——v1 无交互审批桥，请走审批流后重试（规格档 H3 待办）`,
    }
  }
  return { enforcing: true, allow: true, rule: 'mode-pass' }
}

// ---------- 钩子（挂进 ekkoToolExecuteHooks） ----------

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
        payload: { tool, rule: v.rule },
      })
    })
    .catch(() => { /* fail-soft */ })
}

/** 执法钩子（H3 v1）：preExecute 裁决。拒绝时 govbus 留痕 + 审计账 deny 条目。 */
export function ekkoEnforceGateHook(): StructuralToolHook {
  return {
    async preExecute(name: string, input: Record<string, unknown>, context?: { profileId?: string }) {
      let verdict: EnforceVerdict
      try {
        verdict = evaluateEnforcement(name, input, context?.profileId)
      } catch {
        return  // fail-open：裁决面异常不拦截
      }
      if (verdict.enforcing && verdict.allow === false) {
        emitDenyEvent(name, context?.profileId, verdict)
        return { allow: false as const, error: verdict.error }
      }
      return
    },
  }
}
