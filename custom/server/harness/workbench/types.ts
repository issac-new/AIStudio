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
import type { EvidenceMode } from '../../eval/types'

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

export interface VariantFile {
  /** 相对 HERMES_HOME 的路径（如 profiles/p1/SOUL.md）。 */
  path: string
  content: string
  digest: string
}

export interface Variant {
  id: string
  label: string
  /** 单文件候选（兼容旧形态）：等于 files[0].content。 */
  content: string
  digest: string
  /** 相对基线的行级摘要（+新增/-删除）。 */
  diffSummary: { added: number; removed: number; unchanged: number }
  /** 多文件候选：files 为新增/修改，deletions 为删除。digest 由 files+deletions 派生。 */
  files?: VariantFile[]
  deletions?: string[]
}

export interface RegressionEvidence {
  runId: string
  suiteName: string
  total: number
  failed: number
  failedTaskIds: string[]
  /** 回归运行通过率（RRSI held-out 侧读数；缺聚合为 null）。 */
  passAt1?: number | null
}

/** 探测证据：全部字段来自 Eval Studio 的真实运行，缺数据为 null。 */
export interface ProbeMetrics {
  evalRunId: string
  setId: string
  setRevision?: number
  /** 历史运行缺省按 explicit 兼容；origin/mixed 只能诊断。 */
  evidenceMode?: EvidenceMode
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

export interface AutoRunState {
  status: 'running' | 'done' | 'stopped' | 'failed'
  setId: string
  tasksTotal: number
  tasksDone: number
  /** 真实成本累计（trace usage 同源；价目缺失的任务用估值并已如实标注）。 */
  costUsd: number
  /** 用估值记账的任务数（价目表未收录模型的兜底口径）。 */
  estimatedTasks: number
  reason?: string
  error?: string
  startedAt: string
  finishedAt?: string
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
  /** 一键自动探测任务态（running 的服务重启后失联，需重新发起）。 */
  autoRun?: AutoRunState
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

/**
 * 噪声标定（RRSI S2：δ 来自未改动基线的重复实测，不提供调参入口）。
 * method 固定 'half-range'：passAt1 半极差 (max-min)/2，保守且不需要分布假设。
 */
export interface NoiseCalibration {
  runIds: string[]
  setId: string
  delta: number
  method: 'half-range'
  /** 参与计算的 passAt1 样本（与 runIds 同序；null 样本如实保留）。 */
  samples: Array<number | null>
  computedAt: string
}

export interface Proposal {
  id: string
  title: string
  hypothesis: string
  surfaceKey: SurfaceKey
  /** 噪声标定（RRSI 接受地板的 δ）；未标定为 null/缺席。 */
  noise?: NoiseCalibration | null
  /** 多文件候选的根（相对 HERMES_HOME）；缺省=单文件模式。 */
  treeRoot?: string | null
  /** managed 面的相对 HERMES_HOME 目标文件；advisory 面只作锚点展示。 */
  targetPath: string | null
  risk: RiskTier
  mode: ProbeMode
  status: ProposalStatus
  /** 经验库的检索单元（源文 per-domain library）；缺省 general。 */
  domain: string
  /** 自动探测运行的基准档案（缺省从 targetPath 的 profiles/<name> 推导）。 */
  profile?: string | null
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
  /** 最近一次被采纳提案再验证的时刻（HarnessPro 轮保鲜 HP-7；缺席=以 createdAt 记龄）。 */
  lastValidatedAt?: string
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

// ---------- RRSI 正则化派生（2026-10-23 吸收轮） ----------

/** 提案级正则化读数：提案端预算/历史证据/噪声带的一次性快照（不落盘，视图现算）。 */
export interface RegularizationDerived {
  /** 论文 t：该面已采纳轮次（未回滚冠军数）。 */
  round: number
  /** 论文 T：退火视界（env HARNESS2_RSI_T，缺省 20）。 */
  horizon: number
  /** 论文 b_t：本轮允许的最大捆绑改动数（余弦退火）。 */
  editBudget: number
  /** 候选中最大捆绑改动文件数（单文件候选=1；树候选=files+deletions）。 */
  maxEditCount: number | null
  editBudgetExceeded: boolean
  /** 噪声带 δ；未标定 null。 */
  noiseDelta: number | null
  noiseRuns: number
  /** 该面连续 stallWindow 个提案无采纳（论文 σ_t）。 */
  stalled: boolean
  stallWindow: number
  /** 该面在本提案之前从未有提案（论文结构性探索 ν：带内增益的唯一豁免）。 */
  firstOnSurface: boolean
  /** 同面历史失败假设的相似警示（论文「失败假设不复提」）。 */
  hypothesisRetry: Array<{ proposalId: string; title: string; status: ProposalStatus; similarity: number }>
}

/** 进化时间线一轮（论文图 6 的一个点：一次被采纳的候选及其证据）。 */
export interface EvolutionRound {
  round: number
  proposalId: string
  variantLabel: string
  promotedAt: string
  rolledBack: boolean
  passAt1: number | null
  tokens: number | null
  costUsd: number | null
  /** 该提案的噪声带 δ（未标定 null）。 */
  noiseDelta: number | null
  /** 相对该提案基线的通过率增量（选中候选对比）。 */
  passAt1Delta: number | null
}

export interface EvolutionSurface {
  surfaceKey: SurfaceKey
  /** 已采纳轮次（未回滚）。 */
  rounds: number
  proposalsTotal: number
  promoted: number
  rejected: number
  rolledBack: number
  open: number
  failedProbes: number
  stalled: boolean
  /** 论文 S4：近 pruneN 个提案的全部已记录探测最大增量 ≤0 → 建议做减法提案。 */
  pruneSuggested: boolean
  timeline: EvolutionRound[]
}

export interface EvolutionReport {
  config: {
    horizon: number
    bMin: number
    bMax: number
    stallWindow: number
    pruneN: number
    beta0: number
    beta1PerPoint: number
    requireNoise: boolean
  }
  surfaces: EvolutionSurface[]
  /** 从未有提案的面（论文 U_t：探索槽位应留给它们）。 */
  unexercised: SurfaceKey[]
  /** 冠军退役候选（2026-10-23 挂账清偿 G4，advisory）：采纳时无增益且成本上涨、
   *  其后 ≥2 个已采纳轮未被纠正的冠军——「拆墙」侧复核清单，人裁决。 */
  retirementCandidates: RetirementCandidate[]
}

/** 退役候选（腾讯文误区九：随模型迭代，当年加的控制组件该被果断拆除）。 */
export interface RetirementCandidate {
  surfaceKey: SurfaceKey
  /** 进化时间线上的轮次号。 */
  round: number
  proposalId: string
  variantLabel: string
  /** 采纳时通过率增量（≤0 触发考察）。 */
  passAt1Delta: number | null
  /** 相对前一轮的成本变化（>0=变贵；null=任一侧缺读数）。 */
  costDeltaPct: number | null
  /** 相对前一轮的 token 变化（成本缺读数时的次口径）。 */
  tokenDeltaPct: number | null
  /** 该冠军之后的已采纳轮数（含回滚排除后的现存轮）。 */
  roundsSince: number
}

// ---------- HarnessPro 帕累托三档选拔（2026-10-23 吸收轮） ----------

/** 部署预算档位（论文：Lite 省钱 / Medium 均衡 / Heavy 高性能三代表）。 */
export type ParetoTier = 'lite' | 'medium' | 'heavy'

/** 帕累托判定点：候选的一次已记录探测读数（双指标全非 null 才参与判定）。 */
export interface ParetoPoint {
  variantId: string
  label: string
  passAt1: number | null
  costUsd: number | null
}

export interface ParetoEntry extends ParetoPoint {
  /** 是否在帕累托前沿（无其他候选支配）。 */
  onFrontier: boolean
  /** 支配本候选的候选 id（非前沿候选必有 ≥1；前沿为空数组）。 */
  dominatedBy: string[]
  /** 三档代表归属（仅前沿候选可中选；多档可同归一候选；未中选 null）。 */
  tier: ParetoTier | null
}

export interface ParetoReport {
  /** 双指标齐全、参与判定的候选数。 */
  eligible: number
  /** 缺读数被排除的候选（如实列出，不猜）。 */
  excluded: Array<{ variantId: string; label: string; reason: string }>
  entries: ParetoEntry[]
  /** 权重实例化说明（论文未公开公式，本仓口径）。 */
  note: string
}
