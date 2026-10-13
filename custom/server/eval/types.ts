// overlay[eval] Eval Studio · 域类型与配置（spec: 2026-10-07-eval-studio-design.md）。
//
// 范式来源：《美团 Agent 评测体系技术拆解》——
//   Task = (Problem, Reference, Metric & Rubric)；Reference=Expected Behavior；
//   Rubric 二元化（断言集 [是/否/未知] + unknown 诊断）；四层 Result/Trajectory/
//   Efficiency/Risk（Risk 一票否决）；Pass@k 统计门禁（单跑不作门禁）。
//
// 本域刻意不 import 上游模块（符号链接路径解析陷阱，见 controllers/hermes/trace.ts
// 文件头注释）：证据经 EvidenceProvider 注入，判定经 AskFn 注入，全依赖可测。

/** 评测集双轨：E2E=任务级（拉警报），Process=模块级（定位责任方）。 */
export type Track = 'e2e' | 'process'

/** 断言四层归属：result/trajectory 走通过率，risk 一票否决，efficiency 走指标不做断言。 */
export type AssertionKind = 'result' | 'trajectory' | 'risk'

/** 二元判词。unknown 是一等公民：Rubric 定义不充分的诊断信号（美团 unknown 占比纪律）。 */
export type Binary = 'yes' | 'no' | 'unknown'

/**
 * 链路六环节归属（腾讯评测体系：意图/工具/参数/证据/状态/表达，任一环出问题单独报警）。
 * 断言可选标注 link → 聚合按环节分段出通过率，环节级独立小门。
 */
export type EvalLink = 'intent' | 'tool_choice' | 'params' | 'evidence' | 'state' | 'expression'

/** 异常场景六类（腾讯：测试集不能只放理想问题——覆盖模糊意图/缺参数/权限不足/工具超时/知识冲突/用户改口）。 */
export type ExceptionType =
  | 'none'
  | 'ambiguous_intent'
  | 'missing_param'
  | 'insufficient_permission'
  | 'tool_timeout'
  | 'knowledge_conflict'
  | 'user_rephrase'

export type VerdictSource = 's0' | 's1' | 'human' | 's0+s1'

/** S0 确定性规则（零判定费）。regex 对证据全文；threshold 对 efficiency 指标。 */
export interface S0RegexRule {
  kind: 'regex'
  pattern: string
  flags?: string
}

export interface S0ThresholdRule {
  kind: 'threshold'
  metric: 'tokens' | 'steps' | 'costUsd' | 'durationMs'
  op: '<' | '<=' | '>' | '>='
  value: number
}

export type S0Rule = S0RegexRule | S0ThresholdRule

/** 二元断言。expect=期望答案；risk 断言（红线）expect 必须为 'no'（坏事不应发生），实测 value='yes' 即命中红线。 */
export interface RubricAssertion {
  id: string
  text: string
  expect: 'yes' | 'no'
  kind: AssertionKind
  /** 链路六环节归属（可选；标注后聚合按环节分段出独立通过率）。 */
  link?: EvalLink
  s0?: S0Rule
}

/** 环境终态校验声明（文章启示⑤：文本声明≠任务完成，以系统实际状态为准）。 */
export interface OutcomeCheckDecl {
  verifier: string
  params: Record<string, string>
}

/** 坏例回流来源（腾讯：线上坏例转回归样本防回潮；回流任务带溯源，不匿名混入）。 */
export interface ReflowOrigin {
  runId: string
  taskId: string
  sampleIdx?: number
  at: number
}

export interface EvalTask {
  id: string
  problem: string
  expectedBehavior: string
  rubric: RubricAssertion[]
  outcome?: OutcomeCheckDecl
  /** 异常场景类目（缺省 'none'=理想问题；标注后按类目分桶出报告）。 */
  exceptionType?: ExceptionType
  /** 期望工具调用序列（工具名，按序）——Tool Head Accuracy 与轨迹编辑距离的参照路径。 */
  expectedToolCalls?: string[]
  /** 回流溯源（由坏例回流端点写入；手工建集不填）。 */
  origin?: ReflowOrigin
}

export interface EvalSet {
  id: string
  name: string
  track: Track
  /** Process 轨归属模块（如 skill:web_search）——模块级指标下滑直接路由到责任方。 */
  module?: string
  /** 密封集：内容永不出 API 面、不可改题（改题须先走 Rubric Loop 留痕）、运行报告只回聚合。 */
  sealed: boolean
  createdAt: number
  createdBy?: string
  tasks: EvalTask[]
}

/** 集元数据（密封契约：list 面永不携带题目内容）。 */
export interface EvalSetMeta {
  id: string
  name: string
  track: Track
  module?: string
  sealed: boolean
  createdAt: number
  createdBy?: string
  taskCount: number
  runCount: number
}

export interface AttemptVerdict {
  assertionId: string
  value: Binary
  source: VerdictSource
  /** S0 与 S1/人工结论相反：进仲裁（人工裁决 + Rubric Loop），value 保守取 unknown。 */
  conflict?: boolean
  /** S1 判定概率（noul P(yes)），留痕供校准分析。 */
  p?: number
}

export interface AttemptEfficiency {
  tokens?: number
  /** 单任务成本（价目表币种，idle/peak 两档中值；未收录模型缺席不造数——pricing 三原则）。 */
  costUsd?: number
  steps?: number
  durationMs?: number
  /** 首 token 时延（毫秒；trace 具备 first_token_ms 字段才有——当前 L2 轨迹未打点则缺席）。 */
  ttftMs?: number
}

/** 实际工具调用序列（tool_span 按出现序折叠，只留名字与成败——过程双指标数据源）。 */
export interface ToolCallRecord {
  name: string
  ok: boolean
  durationMs?: number
}

export interface Attempt {
  taskId: string
  sampleIdx: number
  sessionId?: string
  verdicts: AttemptVerdict[]
  outcome?: { verifier: string; ok: boolean; detail?: string }
  efficiency?: AttemptEfficiency
  toolCalls?: ToolCallRecord[]
  judgeMeta?: { backend: string; latencyMs: number | null; cached: boolean; online: boolean; models?: string[] }
  passed?: boolean
  judgedAt?: number
}

export type RunStatus = 'done' | 'failed'

export interface RunAggregates {
  taskCount: number
  /** sampleIdx=1 的任务通过率；无样本时 null。 */
  passAt1: number | null
  /** 任一 sample 通过即计该任务（k 次采样统计基线）。 */
  passAtK: number | null
  byLayer: {
    result: number | null
    trajectory: number | null
    risk: 'none' | 'clean' | 'violated' | 'unknown'
    efficiency: { avgTokens: number | null; avgCostUsd: number | null; avgSteps: number | null; avgDurationMs: number | null }
  }
  /** unknown 判词占全部判词比例——Rubric 定义不充分的诊断信号。 */
  unknownRatio: number
  /** 超过 unknownWarnRatio 时为 true：报告页触发"Rubric 下钻"提示。 */
  rubricDrilldownHint: boolean
  /** 任一 attempt 的任一 risk 断言命中红线（value≠expect 且非 unknown）→ 整 run FAIL。 */
  riskVeto: boolean
  /** k<2：单跑结果不产生门禁结论（文章启示②）。 */
  statisticallyInsufficient: boolean
  /** 本次运行 S1 判定端是否在线（离线=纯 S0 + unknown，fail-open）。 */
  judgeOnline: boolean
  /** 校准度（六文调研轮 G）：消费判词 p 留痕的信心 vs 命中分析；无 p 判词时 samples=0 如实缺席。 */
  calibration?: import('./calibration').CalibrationSummary
  /** 链路六环节分段（腾讯启示②：意图/工具/参数/证据/状态/表达各设阈值独立报警）；无 link 标注时缺省。 */
  byLink?: Partial<Record<EvalLink, { total: number; passed: number; unknown: number; passRate: number | null }>>
  /** 异常场景分桶（腾讯 §3：异常覆盖报告）；全 'none' 时缺省不产噪。 */
  byException?: Array<{ type: ExceptionType; taskCount: number; passAtK: number | null }>
  /** 过程双指标（腾讯启示③：结果分之外的第二道闸——抓碰巧答对与绕冤枉路）；无任务声明 expectedToolCalls 时缺省。 */
  processMetrics?: {
    /** 工具选择正确率：LCS(期望,实际)/|期望| 均值，越高越好。 */
    toolHeadAccuracy: number | null
    /** 轨迹匹配分（文章原口径=编辑距离/最优路径长度）：均值，越低越好（0=零绕路）。 */
    trajectoryMatchScore: number | null
    /** 参与对比的 attempt 数（有期望序列且有实际序列证据）。 */
    attemptsCompared: number
  }
  /** 六维度量分面（信通院《云上 Agent 基准度量模型》）：未采集维 value=null 立账不造数。 */
  sixDimensions?: import('./metrics').SixDimensionRow[]
  /** 发布门禁（腾讯启示⑦：上线就绪从主观判断转成可机械执行的 gate）；证据缺口项如实 no_data。 */
  releaseGate?: import('./releaseGate').ReleaseGateSummary
}

export interface EvalRunTarget {
  profile?: string
  model?: string
  version?: string
}

export interface EvalRun {
  id: string
  setId: string
  target: EvalRunTarget
  k: number
  status: RunStatus
  attempts: Attempt[]
  aggregates: RunAggregates
  createdAt: number
  createdBy?: string
  note?: string
}

/** 运行报告对外形态：密封集只回聚合（防探测：逐条对错可被重试探测泄露）。 */
export interface EvalRunReport {
  id: string
  setId: string
  setTrack: Track
  target: EvalRunTarget
  k: number
  status: RunStatus
  createdAt: number
  aggregates: RunAggregates
  /** 非密封集才有：attempt 级明细（判词来源/冲突/outcome 详情）。 */
  attempts?: Attempt[]
}

/** 归因双 Loop 的 Rubric Loop 账本（文章启示④：只修 Agent 不校 Rubric = 拟合评测分布）。 */
export interface RubricIterationLog {
  id: string
  runId: string
  taskId: string
  assertionId: string
  /** 标记时点的判词（judge_wrong 的对象 / rubric_ambiguous 的诱因）。 */
  verdictAtTime: Binary
  finding: 'judge_wrong' | 'rubric_ambiguous'
  note?: string
  /** 修订后的断言文本（改题内容，留痕可审计）。 */
  revision?: string
  rerunRunId?: string
  createdAt: number
  createdBy?: string
}

/** 判定证据：回放判分时从轨迹/DB 注入（L2 trace JSONL 直读为 v1 主源）。 */
export interface Evidence {
  transcript?: string
  efficiency?: AttemptEfficiency
  outcomeDetail?: string
  /** 工具调用序列（过程双指标数据源；无工具调用的证据可为空数组）。 */
  toolCalls?: ToolCallRecord[]
}

export interface EvalConfig {
  judgeBaseUrl: string
  judgeModel: string
  /**
   * 裁判模型清单（EVAL_JUDGE_MODELS 逗号分隔；缺省单模型=judgeModel）。
   * >1 个时逐模型判定后多数决（平票/灰区 → unknown）——判定成本随模型数线性放大，
   * 默认单模型；单模型失败 fail-soft 由其余模型承接（腾讯启示：裁判与被评隔离的轻量形）。
   */
  judgeModels: string[]
  judgeTimeoutMs: number
  /** S1 noul 概率三段映射：≥tauYes → yes；≤tauNo → no；灰区 → unknown。 */
  tauYes: number
  tauNo: number
  unknownWarnRatio: number
  maxStateChars: number
  cacheTtlMs: number
  breakerThreshold: number
  breakerCooldownMs: number
  sealedMaxAttempts: number
}

function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? v : fallback
}

export function loadEvalConfig(): EvalConfig {
  const judgeModel = process.env.EVAL_JUDGE_MODEL?.trim() || 'clef-flash-4bit'
  const modelsEnv = process.env.EVAL_JUDGE_MODELS?.trim()
  const judgeModels = modelsEnv
    ? modelsEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : [judgeModel]
  return {
    judgeBaseUrl: process.env.EVAL_JUDGE_BASE_URL?.trim() || 'http://127.0.0.1:8000',
    judgeModel,
    judgeModels,
    judgeTimeoutMs: num('EVAL_JUDGE_TIMEOUT_MS', 12000),
    tauYes: num('EVAL_TAU_YES', 0.75),
    tauNo: num('EVAL_TAU_NO', 0.25),
    unknownWarnRatio: num('EVAL_UNKNOWN_WARN_RATIO', 0.2),
    maxStateChars: num('EVAL_MAX_STATE_CHARS', 4000),
    cacheTtlMs: num('EVAL_CACHE_TTL_MS', 5 * 60_000),
    breakerThreshold: num('EVAL_BREAKER_THRESHOLD', 5),
    breakerCooldownMs: num('EVAL_BREAKER_COOLDOWN_MS', 120_000),
    sealedMaxAttempts: num('EVAL_SEALED_MAX_ATTEMPTS', 3),
  }
}
