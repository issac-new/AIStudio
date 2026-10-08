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
import { sessionModeOf } from '../permmodes/session-mode-store'

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
  /** 会话档取值（v4 通道轮）：per-profile 会话权限档，优先于全局档、让位于阶梯。 */
  sessionModeOf?: (profileId?: string) => PermissionMode | null
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
      error: `权限模式 ${mode}（${modeSource}）不放行 ${toolCategoryOf(tool)} 类工具（${tool}）`,
    }
  }
  if (decision.needsApproval) {
    return {
      enforcing: true, allow: false, rule: 'mode-needs-approval',
      error: `权限模式 ${mode}（${modeSource}）对 ${toolCategoryOf(tool)} 类工具要求人工审批（${tool}）——请走审批流后重试，或下调该 profile 会话档`,
    }
  }
  return { enforcing: true, allow: true, rule: 'mode-pass' }
}

// ---------- 钩子（挂进 ekkoToolExecuteHooks） ----------

// ── H3 交互审批桥（2026-10-08 收口轮）──
// 只转"需人工确认"类拒绝（RA 档/阶梯确认点）；硬边界（OFF/风险上限/insight 只读）
// 不经桥——批单不越权。approved=同 callHash 批单在案且未消费（consume-on-pass）；
// ticket=挂单信息（deny 文案带单号指引批后重试）。
export const APPROVAL_CLASS_RULES: ReadonlySet<string> = new Set(['mode-needs-approval', 'ladder-approval-point'])

export function applyApprovalBridge(
  v: EnforceVerdict,
  bridge: { approved: boolean; ticket?: { id: string; status: 'pending' | 'approved' | 'rejected' } | null },
): EnforceVerdict {
  if (!(v.enforcing && v.allow === false) || !APPROVAL_CLASS_RULES.has(v.rule)) return v
  if (bridge.approved) return { enforcing: true, allow: true, rule: 'approval-passed' }
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
      let bridgeFacts: Awaited<ReturnType<typeof approvalBridgeFacts>> | null = null
      try {
        verdict = evaluateEnforcement(name, input, context?.profileId)
        // 审批桥只对确认类裁决采事实（避免给硬边界/放行类挂单）
        if (verdict.enforcing && verdict.allow === false && APPROVAL_CLASS_RULES.has(verdict.rule)) {
          bridgeFacts = await approvalBridgeFacts(name, input, context?.profileId, verdict.rule)
          verdict = applyApprovalBridge(verdict, bridgeFacts)
        }
      } catch {
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
      if (verdict.enforcing && verdict.allow === false) {
        emitDenyEvent(name, context?.profileId, verdict)
        return { allow: false as const, error: verdict.error }
      }
      return
    },
  }
}
