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
  s0?: { kind: 'regex'; pattern: string; flags?: string } | { kind: 'threshold'; metric: string; op: string; value: number }
}

export interface EvalTaskDto {
  id: string
  problem: string
  expectedBehavior: string
  rubric: EvalAssertionDto[]
  outcome?: { verifier: string; params: Record<string, string> }
}

export interface EvalSetDto {
  id: string
  name: string
  track: 'e2e' | 'process'
  module?: string
  sealed: boolean
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
  createdAt: number
  createdBy?: string
  taskCount: number
  runCount: number
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
}

export interface AttemptDto {
  taskId: string
  sampleIdx: number
  sessionId?: string
  verdicts: Array<{ assertionId: string; value: 'yes' | 'no' | 'unknown'; source: string; conflict?: boolean; p?: number }>
  outcome?: { verifier: string; ok: boolean; detail?: string }
  efficiency?: { tokens?: number; costUsd?: number; steps?: number; durationMs?: number }
  judgeMeta?: { backend: string; latencyMs: number | null; cached: boolean; online: boolean }
  passed?: boolean
  judgedAt?: number
}

export interface RunSummaryDto {
  id: string
  setId: string
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
  listVerifiers: () => req<{ verifiers: string[] }>('/api/hermes/eval/outcome-verifiers'),
  // —— UI Oracle（M3）——
  listOracleCases: () => req<{ cases: unknown[] }>('/api/hermes/eval/oracle/cases'),
  createOracleCase: (input: { name: string; targetUrl: string; action: { kind: string; somIndex?: number; selector?: string }; expectText?: string }) =>
    req<{ case: unknown }>('/api/hermes/eval/oracle/cases', { method: 'POST', body: JSON.stringify(input) }),
  runOracleCase: (id: string) =>
    req<{ run: unknown }>(`/api/hermes/eval/oracle/cases/${encodeURIComponent(id)}/run`, { method: 'POST' }),
  listOracleRuns: (caseId?: string) =>
    req<{ runs: unknown[] }>(caseId ? `/api/hermes/eval/oracle/runs?caseId=${encodeURIComponent(caseId)}` : '/api/hermes/eval/oracle/runs'),
}
