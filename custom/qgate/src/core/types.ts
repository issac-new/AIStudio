// QGate 内核对象模型。平台无关：本文件（及 core/ 全域）不 import 任何 ZCode 概念。
// 设计依据：docs/superpowers/specs/2026-09-23-qgate-universal-delivery-gate-design.md §4-§5。

/** 六态判定。CONDITIONAL 为对齐交付标准 G4 新增（必须带解除条件）。 */
export type GateVerdict =
  | 'PASS'
  | 'FAIL'
  | 'CONDITIONAL'
  | 'INCONCLUSIVE'
  | 'WAIVED'
  | 'NOT_APPLICABLE'

/** 交付标准证据三级：present=文件在 / wired=接进链 / exercised=真跑过（设计 §4.2）。
    cached=输入未变时复用上轮证据（§49）——缓存命中不等于真跑过，决策层照旧判定。 */
export type EvidenceExecution = 'present' | 'wired' | 'exercised' | 'cached'

/** 证据独立性（谁生成的），与 execution（跑没跑）正交（v0.1 §31）。 */
export type EvidenceIndependence =
  | 'self-generated'
  | 'implementation-derived'
  | 'spec-derived'
  | 'existing-independent'
  | 'runtime-observed'
  | 'ontology-derived'
  | 'human-reviewed'

/** Agent 生命周期触发点（维度 B，v0.1 §5.2）。 */
export type Trigger = 'task_start' | 'before_change' | 'after_edit' | 'task_close' | 'pre_commit' | 'release'

export type QualityDomain = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
export type Criticality = 'high' | 'medium' | 'low'

/** Policy 动作：block=阻断 / warn=放行但降级为 CONDITIONAL。 */
export type PolicyAction = 'block' | 'warn'

// ── Claim：要证明什么 ──

export interface Claim {
  id: string
  statement: string
  domain: QualityDomain
  criticality: Criticality
  /** 可选追溯：交付标准 G 门编号（G1-G6）或需求编号，供人读（设计 §4.4）。 */
  source?: string[]
  tags?: string[]
}

// ── Gate Spec（声明式，qgate/v1alpha1） ──

export interface ExecutorSpec {
  id: string
  type: 'command' | 'persistence' | 'ontology' | 'files' | 'llm'
  /** command：argv 固定命令（无 shell 拼接，安全边界设计 §5.5）。 */
  command?: string[]
  /** command：cwd 相对工作目录前缀（默认项目根）。 */
  cwd?: string
  /** command：预期退出码（默认 0）。 */
  expectExit?: number
  /** command：超时毫秒（默认 120000）。 */
  timeoutMs?: number
  /** persistence：场景文件路径（相对 .qgate/ 或内置 pack scenarios/）。 */
  scenario?: string
  /** ontology：内容扫描 glob（默认 docs 与 src 下的 md/ts 文件）。 */
  scan?: string[]
  /** files：必须存在的制品 glob 清单（present 级证据）。 */
  require?: string[]
  /** 运行期由 loader 注入：所属 pack 名（场景文件回退解析用）。 */
  packHint?: string
  /** 该 executor 产出的 evidence type。 */
  evidenceType: string
}

export interface GateSpec {
  apiVersion: 'qgate/v1alpha1'
  kind: 'Gate'
  metadata: { id: string; version: string; description?: string; pack?: string }
  spec: {
    domain: QualityDomain
    claims: string[]
    /** 变更命中任一 glob 才适用（增量验证，维度 A×B 解耦）。 */
    appliesWhen?: { changed: { any?: string[]; all?: string[] } }
    triggers: Trigger[]
    executors: ExecutorSpec[]
    /** PASS 所需 evidence type 全集。 */
    evidence: { required: string[] }
    policy: {
      failure: PolicyAction
      inconclusive: PolicyAction
      allowWaiver?: boolean
      maxAgeHours?: number
    }
  }
}

// ── Profile（裁剪；tier 别名对齐交付标准，设计 §4.3） ──

export type DeliveryTier = 'lite' | 'standard' | 'compliance'

export interface Profile {
  apiVersion: 'qgate/v1alpha1'
  kind: 'Profile'
  metadata: { id: string; tier?: DeliveryTier; description?: string }
  spec: {
    enable: string[]
    disable: string[]
    /** 逐门 policy 覆盖。 */
    overrides?: Record<string, { policy?: Partial<GateSpec['spec']['policy']> }>
  }
}

// ── Evidence / Run / Risk / Exception ──

export type EvidenceResult = 'pass' | 'fail' | 'error' | 'conditional' | 'skipped'

export interface Evidence {
  id: string
  runId: string
  gateId: string
  type: string
  producer: string
  result: EvidenceResult
  execution: EvidenceExecution
  independence?: EvidenceIndependence
  summary?: string
  provenance: {
    startedAt: number
    endedAt?: number
    exitCode?: number
    command?: string
    cwd?: string
    commit?: string
    treeHash?: string
    affectedPaths?: string[]
  }
  artifacts?: string[]
}

export interface GateRun {
  runId: string
  gateId: string
  gateVersion: string
  trigger: Trigger
  workspace: string
  startedAt: number
  endedAt?: number
  verdict: GateVerdict
  /** CONDITIONAL 必填（解除条件），设计 §4.1。 */
  conditions?: string[]
  evidenceIds: string[]
  commit?: string
  treeHash?: string
  changedPaths?: string[]
  failureSummary?: string
}

export interface Risk {
  id: string
  gateId?: string
  claimId?: string
  severity: Criticality
  description: string
  status: 'open' | 'mitigated' | 'accepted'
  createdAt: number
  source: string
}

export interface ExceptionWaiver {
  id: string
  gateId: string
  reason: string
  scope?: string
  approver: string
  mitigation?: string
  /** epoch ms；过期即失效（Exception 不能永久隐藏 Risk，v0.1 §17）。 */
  expiresAt: number
  /** 复验方式：到期后按什么步骤重验。 */
  revalidation?: string
  createdAt: number
}
