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
  type: 'command' | 'persistence' | 'ontology' | 'files' | 'llm' | 'scope' | 'traceability' | 'register'
    | 'contract' | 'behavior' | 'semantic' | 'ops'
  /** command：argv 固定命令（无 shell 拼接，安全边界设计 §5.5）。 */
  command?: string[]
  /** command：cwd 相对工作目录前缀（默认项目根）。 */
  cwd?: string
  /** command：预期退出码（默认 0）。 */
  expectExit?: number
  /** command：超时毫秒（默认 120000）。 */
  timeoutMs?: number
  /** command：原始测试报告交叉核验（v0.3 §3.1，上游 ADR-0007 本地方言）。
      声明后内核独立重解析 TAP/JUnit 重算计数：exit 0 但报告含失败、或 total<minTotal
      静默空跑 → error 证据（INCONCLUSIVE，不是 PASS）。 */
  rawOutput?: { format: 'tap' | 'junit'; file: string; minTotal?: number }
  /** persistence：场景文件路径（相对 .qgate/ 或内置 pack scenarios/）。 */
  scenario?: string
  /** ontology：内容扫描 glob（默认 docs 与 src 下的 md/ts 文件）。 */
  scan?: string[]
  /** files：必须存在的制品 glob 清单（present 级证据）。 */
  require?: string[]
  /** files：文件存在之外还须包含指定标记串（格式在档检查，仍为 present 级）。 */
  mustContain?: Array<{ file: string; markers: string[] }>
  /** 检查模式：scope/acceptance（scope executor）；diff/breaking/surface/matrix（contract）；
      cases/journey/property/visual/invariant（behavior，invariant=R8 上游 invariant 本地方言）；
      metrics/budget/rerun/trace-continuity/resilience/topology/conventions/consistency/configuration/documentation/symbols/writing-style（ops，
      后五者为 R8 门类补齐；writing-style 为 v0.3.1 上游 v1.27 WS 文风检查本地方言：上游 convention-alignment/consistency 五类型/configuration/documentation/symbol-grounding）。 */
  mode?: 'scope' | 'acceptance' | 'diff' | 'breaking' | 'surface' | 'matrix' | 'cases' | 'journey' | 'property' | 'visual' | 'invariant'
    | 'metrics' | 'budget' | 'rerun' | 'trace-continuity' | 'resilience' | 'topology'
    | 'conventions' | 'consistency' | 'configuration' | 'documentation' | 'symbols' | 'writing-style'
  /** traceability：需求登记文件（相对 workspace，默认 .qgate/registers/requirements.json）。 */
  requirementsFile?: string
  /** traceability（v0.3.1，上游 v1.31 requireCaseBinding 本地方言）：开启后未声明
      cases 绑定的 AC FAIL（acCaseUnbound）——AC 必须绑定到真实执行且通过的用例身份，
      无关成功门禁（如只 exit 0 的 command）从此不能充当 AC 证据。默认 false（旧语义零变化）。 */
  requireCaseBinding?: boolean
  /** register：登记簿种类（debt/assumptions/decisions，可多类合一证据）与登记文件路径（单类时可覆盖）。 */
  register?: Array<'debt' | 'assumptions' | 'decisions'>
  registerFile?: string
  /** scope(mode=scope)：任务意图登记绑定（v0.3 §4.2，交集对账 + 哈希防篡改）。 */
  taskIntent?: { file: string; acknowledgedSha256?: string; require?: boolean }

  // ── contract（v0.3 R1：上游 alignment/api-surface/consumer-matrix 本地方言） ──
  /** 期望契约文件（mode=diff）；观察文件由同门先行 command executor 产出（观察文件模式）。 */
  expectedFile?: string
  /** 观察文件（contract diff/breaking/matrix、behavior 全模式、semantic 观察类、ops 观察类）。 */
  observedFile?: string
  /** JSON Pointer 忽略前缀（支持 * 段通配，上游 diff.mjs 语义）。 */
  ignorePaths?: string[]
  /** mode=surface：被登记的 API 面文件（openapi.json）。 */
  surfaceFile?: string
  /** mode=matrix：消费者期望目录（每消费者一个 JSON）。 */
  consumersDir?: string
  /** contract diff/breaking/matrix（v0.3.1，上游 v1.30 F02 requireLive 本地方言）：
      开启后观察文件顶层须显式声明 mode:'live'|'static'——缺失同样 FAIL
      （missingObservationMode：无法区分实时观察与不回报来源的旧 producer，
      缺失不比诚实的 static 更易放行）；static 即 FAIL；畸形值 ERROR。
      未开启时缺失＝未声明，保持兼容。 */
  requireLive?: boolean

  // ── behavior（v0.3 R2：上游 behavior/journey/property/visual 本地方言；R7 F2P/P2P） ──
  cases?: Array<{ id: string; expected?: unknown }>
  scenarios?: Array<{ id: string; expectedSteps: Array<{ id: string; expected?: unknown }> }>
  /** 断言（property 模式；left/right 为观察案例内点路径，value 为字面量）。 */
  assertions?: Array<{ left: string; operator: 'eq' | 'neq' | 'le' | 'lt' | 'ge' | 'gt'; right?: string; value?: unknown; when?: string }>
  allowedTransitions?: string[][]
  seed?: number
  minCases?: number
  /** F2P/P2P 基线观察文件（R7）：{cases:[{id, actual}]}。 */
  baselineFile?: string
  f2p?: string[]
  p2p?: string[]
  maxDiffPixels?: number
  maxDiffRatio?: number
  /** replay-baseline（R8，上游 replayBaseline 本地方言）：归档观察记录作期望基线（内容哈希绑定）。
      声明后 cases 的 expected 以基线 actual 为准（当次观察 vs 归档基线逐用例比对）。 */
  replayBaseline?: { file: string; contentSha256?: string }
  /** semantic check=profile：SHACL-lite 形状文件（R8，上游 semantic-profile 本地方言）。 */
  shapesFile?: string

  // ── semantic（v0.3 R3：上游 semantic-* + OWL 子集本地方言） ──
  check?: 'alignment' | 'consistency' | 'constraint' | 'state' | 'exposure' | 'instance' | 'relation' | 'terminology' | 'profile'
  catalogFile?: string
  dataFile?: string
  /** constraint/state/exposure/relation 所作用的概念 IRI。 */
  concept?: string
  matchMode?: 'strict' | 'subsumed'
  requireRuntimeOrigin?: boolean
  expectedMap?: Array<{ symbol: string; iri: string }>
  relations?: Array<{ subject: string; predicate: string; object: string }>

  // ── ops（v0.3 R4：上游 L4 运营门本地方言） ──
  thresholds?: Record<string, { min?: number; max?: number }>
  pairs?: string[][]
  maxRecoveryMs?: number
  maxAgeDays?: number
  requiredSignals?: string[]
  /** ops symbols：bundler alias 前缀表（如 {'@/': 'custom/client/'}）；说明符前缀命中即映射后解析。 */
  aliases?: Record<string, string>
  /** ops symbols：忽略的说明符前缀（显式豁免清单，如测试运行时注入的全局）。 */
  ignoredSpecifiers?: string[]
  /** ops symbols：依赖清单来源（默认 package.json）。符号链借用架构下指向上游清单
      （如 ../upstream/hermes-studio/package.json）——事实源在哪，接地就核哪。 */
  depsFile?: string

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
    /** 元门标记（v0.3 §3.3）：需要本轮其他门的判定作输入（如 traceability）。
        CLI run 批量执行时元门排在普通门之后；元门永不参与 §49 缓存。 */
    meta?: boolean
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
  /** 逐用例结果（v0.3.1，上游 v1.31 case binding 本地方言）：内核计算/重解析出的
      逐测试点身份与状态。RTM 元门按 AC 绑定逐用例复核——无关成功门禁从此不能充当 AC 证据。
      现有产出面：command+rawOutput（TAP/JUnit 逐点重解析）、behavior cases（逐用例深比较）。 */
  caseOutcomes?: Array<{ id: string; status: 'pass' | 'fail' | 'skip' }>
  /** 度量（v0.3.1，上游 visual diffSource 本地方言）：visual 门像素差的可核验来源——
      exact-bytes（内核 SHA 相等）/ kernel-recompute（内核解码重算）/ self-reported（非 PNG
      声明边界的自报，仅配合容差判定）。来源信号分级与报告呈现消费此字段。 */
  metrics?: { diffSource: 'exact-bytes' | 'kernel-recompute' | 'self-reported'; diffPixels: number; totalPixels: number }
}

export interface GateRun {
  runId: string
  gateId: string
  gateVersion: string
  trigger: Trigger
  workspace: string
  /** 质量域（v0.3.1 补录）：消费端（governance/bridge）按域映射交付门 G1-G6，不再回查门声明。
      旧 run 无此字段（可选）；缺省时消费端走保守兜底路径。 */
  domain?: QualityDomain
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
  /** 输入快照（v0.3 §3.2，上游 inputSnapshot 本地方言）：门声明输入文件的 sha256（相对路径→哈希）。 */
  inputSnapshot?: Record<string, string>
  /** 执行前后两次快照一致（门自身没有改写自己的输入）。 */
  inputsStable?: boolean
  /** 来源信号（v0.3.1，上游 v1.26/v1.31 本地方言）：PASS/CONDITIONAL/WAIVED 的证据
      来源分级（核验/声明/降级/无信号）；FAIL/INCONCLUSIVE/NOT_APPLICABLE 不分类（—）。 */
  sourceSignal?: { labels: Array<'verified' | 'declared' | 'degraded'>; bucket: 'verified' | 'declared' | 'degraded' | 'none' }
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
