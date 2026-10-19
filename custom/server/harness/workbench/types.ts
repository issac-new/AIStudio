// overlay/custom/server/harness/workbench/types.ts
// Harness² 改进实验台（2026-10-19 调研轮）领域类型。
//
// 术语对照源文：
//   - 可编辑面（editable surface）= 系统提示词/护栏/记忆/工具指导/子智能体/Skills/脚本/插件 八类
//   - variant = 任务级递归里的一个候选 Harness 修改
//   - probe = 候选在真实评测运行上的探测结果（证据只能来自 Eval Studio，不手填）
//   - compose = 依据行为差异选出/合并候选
//   - champion = 某个面的当前被采纳版本（跨任务 Improvement Harness 的最小落点）
// 纪律：所有"改好了"的判定必须带真实评测运行；证据不足一律 unknown，不猜。

export type SurfaceKey =
  | 'system_prompt'
  | 'guardrails'
  | 'memory'
  | 'tool_guidance'
  | 'subagents'
  | 'skills'
  | 'scripts'
  | 'plugins'

export type ApplyMode = 'managed' | 'advisory'
export type RiskTier = 'low' | 'medium' | 'high'

export interface SurfaceArtifact {
  /** 相对 HERMES_HOME 的路径（HOME 外路径以绝对路径呈现）。 */
  path: string
  size: number
  mtimeMs: number
  digest: string
}

export interface SurfaceSource {
  /** Harness² 源码里的组件号（c1..c8）；一个本仓面可能对应多个源组件。 */
  components: string[]
  /** 源组件在上下文中的位置：常驻 / 按需加载 / 工具循环内。 */
  context: 'always_on' | 'on_demand' | 'tool_loop'
  /** OpenCode substrate 的可编辑路径模式（源文 _TTS_SURFACE_HEAD_OPENCODE）。 */
  opencode: string
  /** Codex substrate 的可编辑路径模式（源文 _TTS_SURFACE_HEAD_CODEX）。 */
  codex: string
}

export interface EditableSurface {
  key: SurfaceKey
  nameZh: string
  nameEn: string
  /** 源码级映射：本仓面 ↔ Harness² c1..c8。 */
  source: SurfaceSource
  /** managed=工作台可在双闸下写入；advisory=只出建议，由既有管理面执行。 */
  applyMode: ApplyMode
  risk: RiskTier
  editable: boolean
  available: boolean
  artifacts: { count: number; samples: string[] }
  /** 本面产物的修订摘要（路径+大小+mtime 的哈希）；用于展示漂移，不是内容哈希。 */
  revision: string | null
  /** 允许写入的相对路径根（managed 面）；null=不可写。 */
  writableRoots: string[] | null
  expected: string
  managedBy: string
  note: string
}

export type ProposalStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'probing'
  | 'composed'
  | 'promoted'
  | 'rolled_back'

export type ProbeMode = 'parallel' | 'sequential'

export interface Variant {
  id: string
  label: string
  content: string
  digest: string
  /** 相对基线的行级摘要（+新增/-删除）。 */
  diffSummary: { added: number; removed: number; unchanged: number }
}

export interface RegressionEvidence {
  runId: string
  suiteName: string
  total: number
  failed: number
  failedTaskIds: string[]
}

/** 探测证据：全部字段来自 Eval Studio 的真实运行，缺数据为 null。 */
export interface ProbeMetrics {
  evalRunId: string
  setId: string
  setRevision?: number
  k: number
  passAt1: number | null
  passAtK: number | null
  resultPassRate: number | null
  trajectoryPassRate: number | null
  unknownRatio: number | null
  riskVeto: boolean
  judgeOnline: boolean
  statisticallyInsufficient: boolean
  tokens: number | null
  costUsd: number | null
  steps: number | null
  latencyMs: number | null
  regression?: RegressionEvidence
}

export type QualityVerdict = 'improved' | 'regressed' | 'neutral' | 'unknown'

/** 无真值下的行为对比：结果层给质量判定，过程层给差异读数。 */
export interface BehaviorContrast {
  quality: QualityVerdict
  reasons: string[]
  /** 结果层通过率差（候选 - 基线），无数据 null。 */
  passAt1Delta: number | null
  passAtKDelta: number | null
  resultPassRateDelta: number | null
  trajectoryPassRateDelta: number | null
  unknownRatioDelta: number | null
  tokenDeltaPct: number | null
  costDeltaPct: number | null
  stepDeltaPct: number | null
  latencyDeltaPct: number | null
  regressionFailed: number | null
}

export interface Probe {
  id: string
  variantId: string
  status: 'planned' | 'recorded' | 'failed'
  evalRunId?: string
  regressionRunId?: string
  evidence?: ProbeMetrics
  contrast?: BehaviorContrast
  note?: string
  recordedBy?: string
  createdAt: string
  recordedAt?: string
}

export interface ApprovalRecord {
  decision: 'approved' | 'rejected'
  actor: string
  note: string
  /** 批准时绑定的候选集合摘要；任何候选内容变化都会使批准失效。 */
  variantSetDigest: string
  at: string
  /** 全局审批账本条目 id（approval-log）。 */
  approvalLogId?: string
}

export interface CompositionRecord {
  variantId?: string
  mergedContent?: string
  digest: string
  rationale: string
  actor: string
  at: string
}

export interface PromotionRecord {
  actor: string
  at: string
  digest: string
  /** 是否实际写盘（managed 面 + 双闸齐备）。 */
  applied: boolean
  targetPath?: string
  backupPath?: string
}

export interface RollbackRecord {
  actor: string
  at: string
  reason: string
  restoredDigest: string | null
  fileRestored: boolean
}

export interface Proposal {
  id: string
  title: string
  hypothesis: string
  surfaceKey: SurfaceKey
  /** managed 面的相对 HERMES_HOME 目标文件；advisory 面只作锚点展示。 */
  targetPath: string | null
  risk: RiskTier
  mode: ProbeMode
  status: ProposalStatus
  /** 经验库的检索单元（源文 per-domain library）；缺省 general。 */
  domain: string
  budgetCapUsd: number
  evidenceRefs: string[]
  experienceIds: string[]
  baselineRunId: string | null
  baseline: ProbeMetrics | null
  base: { content: string; digest: string; revision: string | null; exists: boolean } | null
  variants: Variant[]
  probes: Probe[]
  approval: ApprovalRecord | null
  composition: CompositionRecord | null
  promotion: PromotionRecord | null
  rollback: RollbackRecord | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type ExperienceStatus = 'candidate' | 'adopted' | 'retired'

export interface Experience {
  id: string
  /** null=跨面通用经验。 */
  surfaceKey: SurfaceKey | null
  /** 域内检索（源文 library 的 domain）；null/缺省=通用。 */
  domain?: string | null
  statement: string
  /** 源文 EXPERIENCE.md 四字段：cue 触发线索 / lesson 可迁移教训 / evidence 证据 / confidence。 */
  cue?: string
  lesson?: string
  evidenceText?: string
  evidenceRefs: string[]
  confidence: 'low' | 'medium' | 'high'
  status: ExperienceStatus
  sourceProposalId?: string
  sourceCandidateId?: string
  /** 被采纳的 harness 快照（源文 library 存整棵 tree，不只存摘要）。 */
  snapshot?: { variantId: string; digest: string; targetPath: string | null; content: string }
  createdAt: string
  updatedAt: string
}

export interface Champion {
  id: string
  surfaceKey: SurfaceKey
  proposalId: string
  variantId: string
  digest: string
  label: string
  previousDigest: string | null
  previousProposalId: string | null
  targetPath: string | null
  applied: boolean
  promotedAt: string
  promotedBy: string
  /** 回滚后置 true；同一面取最近一条未回滚记录作为当前冠军。 */
  rolledBack?: boolean
}

export interface WorkbenchStore {
  version: 1
  nextSeq: number
  proposals: Proposal[]
  experiences: Experience[]
  champions: Champion[]
}

export interface GateBlocker {
  code: string
  message: string
}

export interface PromotionGateReport {
  ok: boolean
  blockers: GateBlocker[]
  warnings: GateBlocker[]
}
