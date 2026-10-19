// overlay/custom/client/eval/api.ts
// Eval Studio 客户端 API 面（/api/hermes/eval/*）。
// 类型为服务端契约的客户端镜像（custom/server/eval/types.ts）——刻意不跨包
// import server 类型（域自包含；API 契约漂移由 e2e/走查承接）。
// 请求走 @/api/client 的 request（带鉴权与 baseUrl 解析，governance api 同款）。
import { request } from '@/api/client'
export interface EvalAssertionDto {
  id: string
  text: string
  expect: 'yes' | 'no'
  kind: 'result' | 'trajectory' | 'risk'
  link?: 'intent' | 'tool_choice' | 'params' | 'evidence' | 'state' | 'expression'
  s0?:
    | { kind: 'regex'; pattern: string; flags?: string }
    | { kind: 'threshold'; metric: string; op: string; value: number }
    | { kind: 'similarity'; minScore: number; stopwords?: string[] }
}

export type ExceptionTypeDto =
  | 'none'
  | 'ambiguous_intent'
  | 'missing_param'
  | 'insufficient_permission'
  | 'tool_timeout'
  | 'knowledge_conflict'
  | 'user_rephrase'

export interface EvalTaskDto {
  id: string
  problem: string
  expectedBehavior: string
  rubric: EvalAssertionDto[]
  outcome?: { verifier: string; params: Record<string, string> }
  exceptionType?: ExceptionTypeDto
  expectedToolCalls?: string[]
  /** 能力维度七值（可选；覆盖度只认显式标注）。 */
  dimension?: string
  origin?: { runId: string; taskId: string; sampleIdx?: number; at: number }
}

export interface EvalSetDto {
  id: string
  name: string
  track: 'e2e' | 'process'
  module?: string
  sealed: boolean
  contentHash?: string
  revision?: number
  createdAt: number
  createdBy?: string
  tasks: EvalTaskDto[]
}

export interface EvalSetMetaDto {
  id: string
  name: string
  track: 'e2e' | 'process'
  module?: string
  sealed: boolean
  contentHash: string
  revision: number
  createdAt: number
  createdBy?: string
  taskCount: number
  runCount: number
}

export interface ReleaseGateCheckDto {
  key: string
  threshold: string
  measured: string | null
  status: 'pass' | 'fail' | 'no_data'
  gap?: string
}

export interface AggregatesDto {
  taskCount: number
  passAt1: number | null
  passAtK: number | null
  byLayer: {
    result: number | null
    trajectory: number | null
    risk: 'none' | 'clean' | 'violated' | 'unknown'
    efficiency: { avgTokens: number | null; avgCostUsd: number | null; avgSteps: number | null; avgDurationMs: number | null }
  }
  unknownRatio: number
  rubricDrilldownHint: boolean
  riskVeto: boolean
  statisticallyInsufficient: boolean
  judgeOnline: boolean
  byLink?: Partial<Record<string, { total: number; passed: number; unknown: number; passRate: number | null }>>
  byException?: Array<{ type: string; taskCount: number; passAtK: number | null }>
  processMetrics?: { toolHeadAccuracy: number | null; trajectoryMatchScore: number | null; attemptsCompared: number }
  sixDimensions?: Array<{ dim: string; value: number | null; basis: string; instrumented: boolean }>
  releaseGate?: {
    verdict: 'pass' | 'fail' | 'no_data'
    checks: ReleaseGateCheckDto[]
    measuredCount: number
    gapKeys: string[]
    basis: string
  }
  /** 百度轮 B3：四层金字塔（模型/应用/Agent/线上）。 */
  pyramid?: {
    layers: Array<{
      key: 'model' | 'app' | 'agent' | 'online'
      status: 'pass' | 'warn' | 'no_data'
      readings: Array<{ key: string; label: string; value: string; tone: 'good' | 'bad' | 'muted' }>
    }>
    anchorDrift: boolean
  }
  /** 百度轮 B4：动作驱动清单（评估器即回报函数——读数驱动什么动作）。 */
  actions?: Array<{ key: string; metric: string; condition: string; action: string; priority: 'high' | 'medium' | 'low' }>
}

export interface AttemptDto {
  taskId: string
  sampleIdx: number
  sessionId?: string
  verdicts: Array<{ assertionId: string; value: 'yes' | 'no' | 'unknown'; source: string; conflict?: boolean; p?: number; reason?: string; previousValue?: string }>
  outcome?: { verifier: string; ok: boolean; detail?: string }
  efficiency?: { tokens?: number; costUsd?: number; steps?: number; durationMs?: number; ttftMs?: number }
  toolCalls?: Array<{ name: string; ok: boolean; durationMs?: number }>
  judgeMeta?: { backend: string; latencyMs: number | null; cached: boolean; online: boolean; models?: string[] }
  passed?: boolean
  judgedAt?: number
}

export interface RunSummaryDto {
  id: string
  setId: string
  setHash?: string
  target: { profile?: string; model?: string; version?: string }
  k: number
  status: string
  createdAt: number
  createdBy?: string
  note?: string
  aggregates: AggregatesDto
}

export interface EvalRunDto extends RunSummaryDto {
  attempts?: AttemptDto[]
}

export interface IterationDto {
  id: string
  runId: string
  taskId: string
  assertionId: string
  verdictAtTime: string
  finding: 'judge_wrong' | 'rubric_ambiguous'
  note?: string
  revision?: string
  createdAt: number
  createdBy?: string
}

export interface RunCompareDto {
  setId: string
  base: { runId: string; target: { profile?: string; model?: string; version?: string }; createdAt: number }
  head: { runId: string; target: { profile?: string; model?: string; version?: string }; createdAt: number }
  perTask: Array<{ taskId: string; base: 'pass' | 'fail' | null; head: 'pass' | 'fail' | null; flip: string }>
  deltas: {
    passAt1: number | null
    passAtK: number | null
    unknownRatio: number | null
    avgTokens: number | null
    avgDurationMs: number | null
    toolHeadAccuracy: number | null
    trajectoryMatchScore: number | null
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await request<{ ok?: boolean; problems?: string[] } & T>(path, {
    credentials: 'same-origin',
    ...init,
  })
  if ((body as { ok?: boolean }).ok === false && Array.isArray(body.problems)) {
    throw new Error(body.problems.join('；'))
  }
  return body as T
}

export const evalApi = {
  listSets: () => req<{ sets: EvalSetMetaDto[] }>('/api/hermes/eval/sets'),
  getSet: (id: string) => req<{ set: EvalSetDto; sealed?: boolean }>(`/api/hermes/eval/sets/${encodeURIComponent(id)}`),
  createSet: (input: { name: string; track: string; module?: string; tasks: unknown[] }) =>
    req<{ set: EvalSetDto }>('/api/hermes/eval/sets', { method: 'POST', body: JSON.stringify(input) }),
  sealSet: (id: string) => req<{ ok: true }>(`/api/hermes/eval/sets/${encodeURIComponent(id)}/seal`, { method: 'POST' }),
  exportSet: (id: string) => req<{ set: EvalSetDto }>(`/api/hermes/eval/sets/${encodeURIComponent(id)}/export`),
  reviseRubric: (setId: string, taskId: string, body: { assertionId: string; revision: string; iterationId?: string }) =>
    req<{ set: EvalSetDto }>(`/api/hermes/eval/sets/${encodeURIComponent(setId)}/tasks/${encodeURIComponent(taskId)}/rubric`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listRuns: (setId?: string) =>
    req<{ runs: RunSummaryDto[] }>(setId ? `/api/hermes/eval/runs?setId=${encodeURIComponent(setId)}` : '/api/hermes/eval/runs'),
  getRun: (id: string) => req<{ run: EvalRunDto }>(`/api/hermes/eval/runs/${encodeURIComponent(id)}`),
  launchRun: (body: { setId: string; samples: Record<string, Array<{ sessionId?: string; evidence?: { transcript?: string } }>>; target?: Record<string, string>; crossValidate?: boolean; note?: string }) =>
    req<{ run: EvalRunDto }>('/api/hermes/eval/runs', { method: 'POST', body: JSON.stringify(body) }),
  humanVerdict: (runId: string, body: { taskId: string; sampleIdx: number; assertionId: string; value: 'yes' | 'no' }) =>
    req<{ run: EvalRunDto }>(`/api/hermes/eval/runs/${encodeURIComponent(runId)}/verdicts`, { method: 'POST', body: JSON.stringify(body) }),
  attribute: (runId: string, body: { route?: 'agent' } | { taskId: string; assertionId: string; finding: 'judge_wrong' | 'rubric_ambiguous'; note?: string }) =>
    req<{ loop: string; iteration?: IterationDto; pointer?: { hint: string } }>(`/api/hermes/eval/runs/${encodeURIComponent(runId)}/attributions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listIterations: (runId: string) =>
    req<{ iterations: IterationDto[] }>(`/api/hermes/eval/runs/${encodeURIComponent(runId)}/iterations`),
  // —— 腾讯评测体系轮 ——
  compareRuns: (base: string, head: string) =>
    req<{ compare: RunCompareDto }>(`/api/hermes/eval/runs/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`),
  // —— 百度评测体系轮 B5：红队种子库（幂等；existed=true 表示已有同名集） ——
  createRedteamSeed: () =>
    req<{ existed: boolean; set: EvalSetMetaDto | EvalSetDto; vectors: Array<{ key: string; label: string; description: string }> }>('/api/hermes/eval/sets/redteam-seed', { method: 'POST' }),
  // —— 后续批 B6：红队变体扩产（24 种子 → 114 变体，按 id 去重幂等追加） ——
  expandRedteamVariants: () =>
    req<{ appended: number; set: { id: string; name: string; taskCount: number; revision: number } }>('/api/hermes/eval/sets/redteam-variants', { method: 'POST' }),
  // —— 后续批 B7：线上证据回填（压测/分档实测 → 门禁 qps/分档项转真判） ——
  recordLiveEvidence: (runId: string, body: {
    qpsProbe?: { targetQps: number; achievedQps: number; errorRate: number; p99ToP50: number; source?: string }
    responseTiers?: Array<{ tier: 'simple' | 'complex'; samples: number; p95Ms: number; source?: string }>
  }) =>
    req<{ run: EvalRunDto }>(`/api/hermes/eval/runs/${encodeURIComponent(runId)}/live-evidence`, { method: 'POST', body: JSON.stringify(body) }),
  reflow: (runId: string, body: { taskId: string; sampleIdx?: number; targetSetId?: string }) =>
    req<{ created: boolean; taskId: string; set: { id: string; name: string; taskCount: number } }>(`/api/hermes/eval/runs/${encodeURIComponent(runId)}/reflow`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listVerifiers: () => req<{ verifiers: string[] }>('/api/hermes/eval/outcome-verifiers'),
  // —— UI Oracle（M3）——
  listOracleCases: () => req<{ cases: unknown[] }>('/api/hermes/eval/oracle/cases'),
  createOracleCase: (input: { name: string; targetUrl: string; action: { kind: string; somIndex?: number; selector?: string }; expectText?: string }) =>
    req<{ case: unknown }>('/api/hermes/eval/oracle/cases', { method: 'POST', body: JSON.stringify(input) }),
  runOracleCase: (id: string) =>
    req<{ run: unknown }>(`/api/hermes/eval/oracle/cases/${encodeURIComponent(id)}/run`, { method: 'POST' }),
  listOracleRuns: (caseId?: string) =>
    req<{ runs: unknown[] }>(caseId ? `/api/hermes/eval/oracle/runs?caseId=${encodeURIComponent(caseId)}` : '/api/hermes/eval/oracle/runs'),
  // —— 优化建议（2026-10-14 阿里调研轮 A+F：半自动挡建议报告）——
  adviceReport: (days = 7, limit = 5) =>
    req<{ ok: boolean; report: AdviceReportDto }>(`/api/optadvice/report?days=${days}&limit=${limit}`),
  // —— 百度评测范式轮：指标治理 / 评估器审计 / 证据回溯 ——
  metricRegistry: () =>
    req<{ registry: MetricRegistryDto; coverage: CoverageDto }>('/api/hermes/eval/metric-registry'),
  evaluatorAudit: (runId: string) =>
    req<{ audit: EvaluatorAuditDto }>(`/api/hermes/eval/runs/${encodeURIComponent(runId)}/evaluators`),
  evidence: (runId: string, taskId: string, sampleIdx: number) =>
    req<EvidenceDto>(`/api/hermes/eval/runs/${encodeURIComponent(runId)}/evidence?taskId=${encodeURIComponent(taskId)}&sampleIdx=${sampleIdx}`),
  // —— 安全红队（百度评测范式轮 §8）——
  redteamCorpus: () => req<RedteamCorpusDto>('/api/hermes/eval/redteam/corpus'),
  runRedteam: (body: { generations?: number; population?: number; threshold?: number; seed?: number }) =>
    req<{ run: RedteamRunDto }>('/api/hermes/eval/redteam/runs', { method: 'POST', body: JSON.stringify(body) }),
  listRedteamRuns: (limit = 20) =>
    req<{ runs: RedteamRunSummaryDto[] }>(`/api/hermes/eval/redteam/runs?limit=${limit}`),
  getRedteamRun: (id: string) =>
    req<{ run: RedteamRunDto }>(`/api/hermes/eval/redteam/runs/${encodeURIComponent(id)}`),
  // —— 留出题库（/api/governance/heldout/*；写面需 super_admin）——
  heldoutSets: () => req<{ sets: HeldOutMetaDto[] }>('/api/governance/heldout/sets'),
  createHeldoutSet: (input: { name: string; items: Array<{ prompt: string; expected: string }> }) =>
    req<{ ok: true; meta: HeldOutMetaDto }>('/api/governance/heldout/sets', { method: 'POST', body: JSON.stringify(input) }),
  scoreHeldout: (id: string, answers: Array<{ index: number; answer: string }>) =>
    req<{ ok: true; result: { n: number; passRate: number; attemptsLeft: number } }>(
      `/api/governance/heldout/sets/${encodeURIComponent(id)}/score`,
      { method: 'POST', body: JSON.stringify({ answers }) },
    ),
}

// ---------- 百度评测范式轮 DTO（服务端契约镜像） ----------

export type MetricActionDto = 'gate_block' | 'reflow' | 'rubric_revise' | 'human_review' | 'advice' | 'dataset_curate' | 'report_only'

export interface MetricDefDto {
  key: string
  layer: string
  zh: string
  en: string
  unit: string
  direction: 'higher_better' | 'lower_better' | 'neutral'
  source: string
  drives: MetricActionDto[]
  gap?: string
  wired: boolean
  decoration: boolean
}

export interface MetricRegistryDto {
  metrics: MetricDefDto[]
  actions: Array<{ key: MetricActionDto; zh: string; en: string }>
  consumption: {
    observations: Array<{ action: MetricActionDto; observed: number; label: string }>
    summary: { total: number; wired: number; unwired: number; decoration: number }
    decorationKeys: string[]
  }
  boundary: string
}

export interface CoverageDto {
  dimensions: Array<{ key: string; zh: string; en: string; taskCount: number; setCount: number }>
  covered: number
  total: number
  untaggedTasks: number
  taskTotal: number
  setTotal: number
}

export interface EvaluatorAuditDto {
  runId: string
  verdictTotal: number
  bySource: { s0: number; s1: number; 's0+s1': number; human: number }
  conflicts: number
  audit: { withReason: number; total: number; ratio: number }
  unknown: { total: number; bySource: Record<string, number>; s1Ratio: number }
  judge: { online: boolean; models: string[]; verdictsWithP: number; meanP: number | null }
  human: { overrides: number; falseKillCandidates: number; falsePassCandidates: number }
  policy: {
    strict: { passAt1: number | null; passAtK: number | null }
    conservative: { passAt1: number | null; passAtK: number | null }
    delta: { passAt1: number | null; passAtK: number | null }
    note: string
  }
  riskLevel: 'ok' | 'watch' | 'high'
  notes: string[]
}

export interface EvidenceDto {
  ok: boolean
  reason?: string
  taskId?: string
  sampleIdx?: number
  sessionId?: string
  transcript?: string
  truncated?: boolean
  toolCalls?: Array<{ name: string; ok: boolean; durationMs?: number }>
  efficiency?: { tokens?: number; costUsd?: number; steps?: number; durationMs?: number; ttftMs?: number }
  meta?: { lines: number; toolCalls: number; tokens: number; durationMs: number | null; startedAt: number | null }
  hint?: string
}

export interface RedteamCorpusDto {
  ok: true
  detector: { id: string; zh: string; en: string; s1Wired: boolean; note: string }
  defaults: { generations: number; population: number; threshold: number; seed: number }
  limits: { maxGenerations: number; maxPopulation: number; maxThreshold: number }
  categories: Array<{ key: string; zh: string; en: string; seedCount: number }>
  benignCount: number
  operators: Array<{ key: string; zh: string; en: string }>
}

export interface RedteamVariantDto {
  id: string
  seedId: string
  category: string
  generation: number
  operator: string | null
  parentId: string | null
  lineage: string[]
  preview: string
  sha: string
  score: number
  hits: string[]
  detected: boolean
}

export interface RedteamRunDto {
  id: string
  createdAt: number
  config: { generations: number; population: number; threshold: number; seed: number }
  detector: string
  s1Wired: boolean
  totals: { evaluated: number; detected: number; evaded: number; evasionRate: number | null }
  benign: {
    total: number
    flagged: number
    falsePositiveRate: number | null
    flaggedSamples: Array<{ seedId: string; preview: string; hits: string[] }>
  }
  byCategory: Array<{ category: string; total: number; detected: number; evasionRate: number | null }>
  byOperator: Array<{ operator: string; total: number; detected: number; evasionRate: number | null }>
  byGeneration: Array<{ generation: number; evaluated: number; detected: number; evasionRate: number | null; bestScore: number | null }>
  survivors: RedteamVariantDto[]
  notes: string[]
}

export interface RedteamRunSummaryDto {
  id: string
  createdAt: number
  config: { generations: number; population: number; threshold: number; seed: number }
  totals: RedteamRunDto['totals']
  benign: { total: number; flagged: number; falsePositiveRate: number | null }
}

export interface HeldOutMetaDto {
  id: string
  name: string
  itemCount: number
  createdAt: number
  sealedBy: string
  attemptCount: number
}

// ---------- 优化建议报告（/api/optadvice/report 客户端镜像） ----------

export interface AdviceSessionDto {
  id: string
  title: string | null
  model: string
  lastActive: number | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
}

export interface AdviceStageDto {
  stage: string
  entered: number
  totalSec: number
  medianSec: number
  p90Sec: number
  sharePct: number
}

export interface AdviceReportDto {
  generatedAt: string
  windowDays: number
  sources: Array<{ id: string; available: boolean; note?: string }>
  tokenTop: AdviceSessionDto[]
  slowStages: AdviceStageDto[]
  gateErrorTop: Array<{ key: string; gate: string; reason: string; count: number; lastAt: number; sample: string }>
  waterfall: { stages: AdviceStageDto[]; cards: Array<{ taskId: string; spanSec: number; transitions: number }>; medianSpanSec: number | null; events: number } | null
}
