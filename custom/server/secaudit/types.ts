// overlay/secaudit 域：六阶段安全审计流水线（2026-10-21 Cloudflare security-audit-skill 吸收）。
//
// 范式来源：Cloudflare security-audit-skill——
//   ①侦察画地图 → ②覆盖账本（每块面查没查、查到什么程度，显式状态）→
//   ③覆盖引导狩猎（候选按面登记）→ ④对抗性验证（发现者≠验证者，全新上下文）→
//   ⑤三态判定（confirmed/needs_validation/rejected，不允许含糊中间态）→
//   ⑥独立记录复核 → ⑦目标中立报告。
// 本域刻意不含 agent 调度：仓库已有三套 spawn 实现（kanban worker / mention dispatch /
// loop dispatcher），审计的"狩猎"由人工或自助 agent 通过 REST 提交候选，产品只管纪律与账本。
//
// 设计边界：
//   - 只读采集（skill/mcp/审批链/工具审计/姿态/进程）不执行目标代码，不需要沙箱；
//     文章"审计过程会运行目标代码（构建/测试/fuzz）→ 必须 OS 沙箱"的条款属于狩猎侧，
//     本域登记候选不写狩猎执行器（决策记录 #2）。
//   - 历史证据不当已覆盖：目标指纹变化后，旧条目降级 partial 并注明原因。

/** 三态判定。不允许含糊中间态：needs_validation 必须写清"哪个确切事实未解"，且不评严重性。 */
export type FindingStatus = 'confirmed' | 'needs_validation' | 'rejected'

/** 覆盖条目状态：full=已检查且有证据；partial=查过但证据不全/过期/目标已变；unchecked=根本没看。 */
export type CoverageStatus = 'full' | 'partial' | 'unchecked'

/** 审计面类别（面向 Agent 部署的 12 类；映射到 Cloudflare 16 类攻击面中本部署可及的子集）。 */
export type SurfaceClass =
  | 'auth_access'          // 认证与访问面（登录/令牌/账户）
  | 'tool_exec'            // 工具执行面（命令/脚本/审批链）
  | 'skills'               // 技能注册面（SKILL.md/脚本形态）
  | 'mcp'                  // MCP 注册面（server 命令/env/外联/仿名）
  | 'supply_chain'         // 供应链与发布（依赖/补丁/构建）
  | 'secrets'              // 密钥与凭据（环境变量/配置内嵌）
  | 'browser_net'          // 浏览器与网络外联
  | 'data_lifecycle'       // 数据隔离与生命周期（store/账本/留存）
  | 'prompt_injection'     // 提示词注入与工具结果护栏
  | 'agents'               // Agent/子代理调度与影子进程
  | 'availability'         // 资源耗尽与可用性
  | 'human_review'         // 人工评审与治理流程
  | 'repo_secrets'         // 代码仓密钥形态（批次 D：目标仓而非本机部署）
  | 'repo_deps'            // 代码仓依赖声明面（漏洞判定指向在线门）
  | 'repo_dangerous_api'   // 代码仓危险 API 形态（eval/exec 拼接/innerHTML）

/** 审计面定义：人工面靠 agent/人工狩猎，自动面有只读采集器。 */
export interface SurfaceDefinition {
  class: SurfaceClass
  name: string
  /** 攻击面意图（自查清单一行话）。 */
  focus: string
  manual: boolean
  collector?: string
}

/** 覆盖账本条目（一个项目一个运行期内，每面一条）。 */
export interface CoverageEntry {
  id: string
  surfaceClass: SurfaceClass
  status: CoverageStatus
  /** 证据摘要（纯文本，人话；不绑机器结构）。 */
  evidenceSummary?: string
  /** 采集器自动产出数（如有）。 */
  autoFindingCount?: number
  /** 该面登记的候选数。 */
  candidateCount?: number
  checkedBy?: string
  checkedAt?: number
  /** partial 原因（证据过期/目标已变/只查了一半）。 */
  partialReason?: string
}

/** 覆盖批评者产出：账本本身的完备性攻击结果。 */
export interface CoverageCriticFinding {
  id: string
  kind:
    | 'unchecked_surface'       // 根本没看
    | 'no_evidence'             // 标了 full 但无证据摘要
    | 'stale_evidence'          // 证据先于当前运行起点（旧账当新账）
    | 'unmapped_class'          // 已注册面未映射到攻击面类
    | 'no_rejected_findings'    // 全数通过：要么没真审，要么验证不力
  surfaceClass?: SurfaceClass
  detail: string
}

export interface CoverageLedger {
  entries: CoverageEntry[]
  /** 批评者结论（有即账本不可信——报告必须如实带出）。 */
  critic: CoverageCriticFinding[]
  /** 汇总（条目级，不造数）。 */
  summary: { total: number; full: number; partial: number; unchecked: number; coverageRatio: number }
}

export interface AuditCandidate {
  candidateId: string
  surfaceClass: SurfaceClass
  title: string
  detail: string
  /** 完整源码/配置追踪链（confirmed 必填）。 */
  traceChain?: string
  /** 有界观察结果（可复核的最小证据；confirmed 必填）。 */
  observation?: string
  author: string
  createdAt: number
}

export interface FindingVerification {
  verificationId: string
  verifier: string
  status: FindingStatus
  /** 证伪理由（rejected 必填）。 */
  refutation?: string
  /** 确切未解事实（needs_validation 必填）。 */
  unknownFact?: string
  /** 严重度（仅 confirmed；needs_validation 绝不评）。 */
  severity?: 'high' | 'medium' | 'low'
  /** 纵深防御缺口：已有一层防御挡住 → 不算漏洞，只算加固建议。 */
  defenseInDepth?: boolean
  at: number
  /** 记录哈希：复核时绑定具体内容，内容改动即失效。 */
  recordHash: string
}

export interface SecAuditFinding {
  findingId: string
  candidate: AuditCandidate
  /** 独立验证记录（验证者≠发现者，后端的硬约束）。 */
  verifications: FindingVerification[]
  /** 当前判定（由最新 verification 决定；无 = needs_validation 未判）。 */
  status: FindingStatus
  /** 裁决依据（最新 verification 的关键字段汇总，报告直读）。 */
  severity?: 'high' | 'medium' | 'low'
  unknownFact?: string
  refutation?: string
  defenseInDepth?: boolean
  decidedBy?: string
  decidedAt?: number
  /** 记录复核（报告期；复核者≠发现者，内容改动后失效）。 */
  recordReviews: Array<{
    reviewId: string
    reviewer: string
    outcome: 'verified' | 'replaced'
    at: number
    recordHash: string
  }>
}

export interface AuditRun {
  runId: string
  projectId: string
  /** 目标指纹（项目快照哈希；跨 run 比较判定旧证据是否过期）。 */
  targetFingerprint: string
  startedAt: number
  endedAt?: number
  status: 'open' | 'reported'
  /** 记录复核完成状态：confirmed/needs_validation 记录是否全部复核过。 */
  recordReview?: { total: number; verified: number; replaced: number; stale: number }
  ledger?: CoverageLedger
  report?: unknown
  closedAt?: number
}

export interface AuditProject {
  projectId: string
  name: string
  target: {
    kind: 'agent-deployment' | 'workspace'
    /** 采集根（HERMES_HOME 等；agent-deployment 用）。 */
    hermesHome?: string
    workspace?: string
  }
  surfaces: SurfaceClass[]
  /** 目标指纹策略：profiles+skills+mcp+审批链的组合哈希。 */
  fingerprint: string
  createdAt: number
  createdBy?: string
  runs: AuditRun[]
  findings: SecAuditFinding[]
  nextSeq: number
}

// ---------- 硬约束规则（判定纪律，后端执行不依赖自觉） ----------

export interface RuleViolation {
  code: string
  detail: string
}

export type RuleResult<T> = { ok: true; value: T } | { ok: false; problems: RuleViolation[] }

/** 取失败分支的问题清单（TS 窄化助手：调用点已判 !result.ok）。 */
export function ruleProblems<T>(r: RuleResult<T>): RuleViolation[] {
  if (r.ok) return []
  return (r as { ok: false; problems: RuleViolation[] }).problems
}

/** 自证拒绝：发现者不得验证自己的发现。 */
export function forbidSelfVerification(author: string, verifier: string): RuleViolation | null {
  return author === verifier
    ? { code: 'self_verification_forbidden', detail: '发现者不得验证自己的发现（对抗性验证核心设计）' }
    : null
}

/** confirmed 判定门槛：完整追踪链 + 有界观察，缺一不收。 */
export function confirmedRequirements(candidate: AuditCandidate): RuleViolation[] {
  const problems: RuleViolation[] = []
  if (!candidate.traceChain?.trim()) problems.push({ code: 'missing_trace_chain', detail: 'confirmed 必须带完整源码/配置追踪链' })
  if (!candidate.observation?.trim()) problems.push({ code: 'missing_observation', detail: 'confirmed 必须带有界观察结果' })
  return problems
}

/** needs_validation 判定门槛：必须写清唯一未解事实，且不评严重性。 */
export function needsValidationRules(unknownFact: string | undefined, severity: unknown): RuleViolation[] {
  const problems: RuleViolation[] = []
  if (!unknownFact?.trim()) problems.push({ code: 'missing_unknown_fact', detail: 'needs_validation 必须写清"哪个确切事实未解"' })
  if (severity !== undefined && severity !== null) problems.push({ code: 'severity_on_needs_validation', detail: 'needs_validation 不允许评严重性（未解事实未定，先判严重度=编造）' })
  return problems
}

/** rejected 判定门槛：必须写清证伪理由。 */
export function rejectedRules(refutation: string | undefined): RuleViolation[] {
  return refutation?.trim()
    ? []
    : [{ code: 'missing_refutation', detail: 'rejected 必须写清证伪理由（何以确定不是漏洞）' }]
}

/** 纵深防御缺口归口：声明 defenseInDepth 的候选只算加固建议，不算漏洞。 */
export function defenseInDepthNormalization(
  status: FindingStatus,
  defenseInDepth: boolean,
  severity: 'high' | 'medium' | 'low' | undefined,
): { status: FindingStatus; severity?: 'high' | 'medium' | 'low'; hardeningAdvice: boolean } {
  if (!defenseInDepth) return { status, severity, hardeningAdvice: false }
  return { status: 'needs_validation', severity: undefined, hardeningAdvice: true }
}
