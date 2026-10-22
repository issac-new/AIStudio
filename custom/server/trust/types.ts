// overlay/trust 域：长程任务可信执行层的数据契约。
//
// 来源：《我发现了渗透Agent长程任务的秘密》（FreeBuf 2026-09-28）。
// 文章把长程任务失效归为三类：上下文膨胀、幻觉自证、中断即回零；对应到执行框架
// 的四个机制：逐条主张三态审计、完成态双准入、工作区完整性栅栏、原子断点。
// 本文件只放类型与常量，不写业务判断；判断在 integrity/admission/service。
//
// 与既有域的关系：证据账（evidence-store）记录"发生了什么"，本域记录"声称的完成
// 是否被独立复核并通过两条准入条件"。两者都用前向哈希链，但本域不复制证据正文。

/** 审计裁决三态：独立复现通过 / 证据不足但无反证 / 观察到与声称相悖的事实。 */
export const CLAIM_VERDICTS = ['verified', 'unverified', 'refuted'] as const
export type ClaimVerdict = (typeof CLAIM_VERDICTS)[number]

/** 工作区完整性三态。unknown 只出现在基线尚未采集时，不冒充 clean。 */
export const INTEGRITY_STATES = ['clean', 'violated', 'unknown'] as const
export type IntegrityState = (typeof INTEGRITY_STATES)[number]

/** 案件级投影状态：open=待裁决，admitted=双条件通过，untrusted=提议被降级。 */
export const TRUST_STATES = ['open', 'admitted', 'untrusted'] as const
export type TrustState = (typeof TRUST_STATES)[number]

/** 执行者在案件里提交的一条完成主张。 */
export interface TrustClaim {
  id: string
  /** 声称完成的事实（一句话，可被独立复核）。 */
  statement: string
  /**
   * 证据锚。支持四种前缀：
   *   file:<相对路径>   必须存在于完整性清单（verified 的硬条件）
   *   git:<提交号>      7-40 位十六进制
   *   sha256:<摘要>     64 位十六进制
   *   note:<自由文本>   只能作辅助说明，不能单独支撑 verified
   */
  evidenceRefs: string[]
  claimedBy: string
  claimedAt: number
}

/** 审计者对一个主张给出的裁决。auditor 必须不同于 claimedBy。 */
export interface ClaimAudit {
  id: string
  claimId: string
  auditor: string
  verdict: ClaimVerdict
  /** 阶段一的只读复核笔记（文章要求先复核再裁决，裁决时不再补做观察）。 */
  observations: string[]
  /** refuted 必须给出反证；verified 可选补充。 */
  counterEvidence?: string
  at: number
}

/** 清单里的一条文件记录。小文件全量哈希；大文件退化为大小+修改时间。 */
export interface IntegrityEntry {
  path: string
  size: number
  mode: 'sha256' | 'size_mtime' | 'symlink'
  sha256?: string
  mtimeMs?: number
  /** symlink 指向的目标字符串（检测重定向）。 */
  linkTarget?: string
  /** 读取失败时退化为大小+修改时间，并在清单里如实标记。 */
  unreadable?: boolean
}

export interface IntegrityManifest {
  id: string
  root: string
  generatedAt: number
  fileCount: number
  totalBytes: number
  /** 清单自身摘要 = sha256(规范化条目)，不包含 generatedAt，保证可比。 */
  digest: string
  /** 达到文件数上限时为 true，不声称覆盖完整工作区。 */
  truncated: boolean
  /** 被排除的目录名计数（不是逐文件明细，避免清单膨胀）。 */
  excludedDirs: Record<string, number>
  entries: IntegrityEntry[]
}

export interface IntegrityChange {
  path: string
  kind: 'added' | 'modified' | 'removed'
}

export interface IntegrityReport {
  state: IntegrityState
  baselineManifestId: string | null
  baselineDigest: string | null
  currentManifestId: string | null
  currentDigest: string | null
  /** 明细最多保留 200 条（防止一次大改把案件文件撑爆），changeTotal 是真实总数。 */
  changes: IntegrityChange[]
  changeTotal: number
  checkedAt: number
  truncated: boolean
  /** 审计者自报的完整性结论（仅留痕，不参与判定）。 */
  selfReported?: IntegrityState
  /** 自报 clean 但清单对比非空：以框架观察为准。 */
  overridden: boolean
}

/** 角色工具面。工具清单是静态声明，不读取运行时配置。 */
export interface RoleSurface {
  role: 'manager' | 'auditor' | 'executor'
  tools: string[]
  allowWrite: boolean
}

export interface ToolSurfaceReport {
  valid: boolean
  sizes: Record<RoleSurface['role'], number>
  violations: string[]
  surfaces: RoleSurface[]
}

export interface AdmissionBlocker {
  code: string
  detail: string
  claimId?: string
}

/** 一次完成提议的裁决记录。状态写入权只属于框架。 */
export interface TrustDecision {
  id: string
  at: number
  actor: string
  result: 'admitted' | 'untrusted'
  proposal: string[]
  blockers: AdmissionBlocker[]
  warnings: string[]
  /** 每条主张在裁决时的最新状态，便于读面直接解释原因。 */
  claimStates: Array<{ claimId: string; verdict: ClaimVerdict | null }>
  integrity: IntegrityReport
  surfaceValid: boolean
}

/** 原子断点：案件摘要 + 工作区清单摘要，用于恢复时核对是否仍一致。 */
export interface TrustCheckpoint {
  id: string
  caseId: string
  round: number
  at: number
  actor: string
  caseDigest: string
  workspaceManifestId: string
  workspaceDigest: string
  workspaceRoot: string
}

export interface TrustCase {
  id: string
  title: string
  /** 可选：关联的推演运行编号或看板任务号。 */
  runId?: string
  workspaceRoot: string
  createdAt: number
  updatedAt: number
  state: TrustState
  forgeAttempts: number
  claims: TrustClaim[]
  audits: ClaimAudit[]
  decisions: TrustDecision[]
  /** 审计开始前的完整性基线（采集于 begin-audit）。 */
  baseline: { manifestId: string; digest: string; at: number; auto: boolean } | null
  /** 最近一次完整性比对结果。 */
  integrity: IntegrityReport | null
  checkpoints: TrustCheckpoint[]
  /** 最近一次未准入的首要原因（读面用，不替代 blockers 明细）。 */
  blockedReason?: string
}

export interface TrustCaseSummary {
  id: string
  title: string
  runId?: string
  state: TrustState
  forgeAttempts: number
  claimCount: number
  verifiedCount: number
  refutedCount: number
  integrityState: IntegrityState
  updatedAt: number
  blockedReason?: string
}

export interface TrustOverview {
  cases: number
  open: number
  admitted: number
  untrusted: number
  forgeAttempts: number
  integrityViolations: number
  ledgerIntact: boolean
  ledgerEntries: number
  surfaceValid: boolean
}

/** 事件账：所有案件变更追加到这里，前向哈希链防改写。 */
export interface TrustLedgerEvent {
  seq: number
  at: number
  caseId: string
  kind: 'case_opened' | 'claims_added' | 'audit_begun' | 'audit_recorded' | 'admission_decided' | 'checkpoint_written'
  actor: string
  body: Record<string, unknown>
  prevHash: string
  hash: string
}

export interface CheckpointVerification {
  status: 'consistent' | 'diverged' | 'workspace_missing' | 'no_checkpoint'
  checkpoint: TrustCheckpoint | null
  currentDigest: string | null
  changes: IntegrityChange[]
  /** 断点之后案件本身是否又变了（新增审计/主张）；不影响工作区一致性判定。 */
  caseChanged: boolean
  checkedAt: number
}
