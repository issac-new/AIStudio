// overlay[eval] Eval Studio · 运行器（spec §4.3）。
//
// v1 主形态=回放判分（零 agent 增量调用）：对已完成的 session 轨迹离线判分——
// 轨迹三层已采集但从未被评分，本模块补上"被评分"的最后一环。
// 证据主源=L2 trace JSONL（~/.hermes/traces/<sessionId>.jsonl，run-trace 插件格式：
// header/chunk(llm_span|tool_span|subagent_span)/trailer），直读文件不 import 上游
// （符号链接路径陷阱，见 controllers/hermes/trace.ts 文件头）。也接受调用方内联证据
// （测试/导入场景）。Efficiency 从 trace usage/trailer 同源取数，不另起口径。
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { estimateCost } from '../tokens/pricing'
import { aggregateRun } from './aggregate'
import { judgeAttempt, type JudgeDeps } from './judge'
import { sha1Of } from './clef'
import { runOutcomeCheck, type OutcomeRunContext } from './outcome'
import { appendRun, getSet, getSetRevision, sealedAttemptCount } from './store'
import { evidenceFromRows, inspectTrace, sampleSpanFromTrace, spanEvidenceFromRows } from './trace-sampler'
import type { Attempt, Evidence, EvalConfig, EvalRun, EvalTask, ToolCallRecord } from './types'
import { loadEvalConfig } from './types'

// ---------- L2 trace 证据提供者 ----------

interface TraceLine {
  type?: string
  kind?: string
  phase?: string
  model?: string
  usage?: Record<string, unknown>
  response_preview?: string
  finish_reason?: string
  tool_name?: string
  args?: unknown
  result?: unknown
  status?: string
  error_message?: string
  duration_ms?: number
  started_at?: number
  ended_at?: number
  /** 首 token 时延（毫秒）——run-trace 插件具备该字段时 TTFT 门禁即自动有数（挂账清偿轮接线）。 */
  first_token_ms?: number
  ttft_ms?: number
  outcome?: string
  summary?: string
}

function traceDir(): string {
  return process.env.EVAL_TRACE_DIR?.trim() || join(homedir(), '.hermes', 'traces')
}

function stringifyFragment(value: unknown, max = 200): string {
  if (value === undefined || value === null) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** usage 对象 → token 分面（prompt/completion 分开取——价目估算需要输入输出分价）。 */
function tokenPartsOfUsage(usage: Record<string, unknown> | undefined): { prompt: number; completion: number } | undefined {
  if (!usage) return undefined
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const prompt = num(usage.prompt_tokens) ?? num(usage.input_tokens)
  const completion = num(usage.completion_tokens) ?? num(usage.output_tokens)
  if (prompt === null && completion === null) {
    const total = num(usage.total_tokens) ?? num(usage.tokens)
    if (total === null) return undefined
    return { prompt: total, completion: 0 }
  }
  return { prompt: prompt ?? 0, completion: completion ?? 0 }
}

/** usage 对象 → 总 token（常见字段名防御式提取）。 */
function tokensOfUsage(usage: Record<string, unknown> | undefined): number | undefined {
  const parts = tokenPartsOfUsage(usage)
  return parts ? parts.prompt + parts.completion : undefined
}

/** token×价目 → 单任务成本（idle/peak 两档中值；未收录模型 undefined——绝不瞎算）。 */
function costOfTokens(model: string | undefined, prompt: number, completion: number): number | undefined {
  if (!model) return undefined
  try {
    const est = estimateCost(model, { uncachedInput: prompt, output: completion, cacheRead: 0, cacheWrite: 0 })
    if (!est) return undefined
    return Math.round(((est.idleCost + est.peakCost) / 2) * 1e6) / 1e6
  } catch {
    return undefined
  }
}

/** 解析 L2 trace JSONL 为证据（transcript 文本 + efficiency 指标 + 工具调用序列）。导出供测试。 */
export function evidenceFromTraceLines(lines: TraceLine[]): Evidence {
  const parts: string[] = []
  let tokens = 0
  let tokensKnown = false
  let promptTokens = 0
  let completionTokens = 0
  let steps = 0
  let durationMs: number | undefined
  let ttftMs: number | undefined
  let model: string | undefined
  const toolCalls: ToolCallRecord[] = []

  for (const line of lines) {
    if (line.type === 'header') {
      if (typeof line.model === 'string' && line.model) model = line.model
      continue
    }
    if (line.type === 'trailer') {
      if (typeof line.duration_ms === 'number') durationMs = line.duration_ms
      if (typeof line.ttft_ms === 'number') ttftMs = line.ttft_ms
      if (line.outcome) parts.push(`[outcome] ${stringifyFragment(line.outcome, 300)}`)
      if (line.summary) parts.push(`[summary] ${stringifyFragment(line.summary, 500)}`)
      continue
    }
    if (line.type !== 'chunk') continue
    if (line.kind === 'llm_span' && line.phase === 'post') {
      const tp = tokenPartsOfUsage(line.usage)
      if (tp) {
        tokens += tp.prompt + tp.completion
        promptTokens += tp.prompt
        completionTokens += tp.completion
        tokensKnown = true
      }
      // 首 token 时延只记首个 span（attempt 级口径=会话首响应）
      if (ttftMs === undefined) {
        const t = line.first_token_ms ?? line.ttft_ms
        if (typeof t === 'number' && Number.isFinite(t)) ttftMs = t
      }
      if (typeof line.model === 'string' && line.model) model = line.model
      if (line.response_preview) {
        parts.push(`[assistant] ${stringifyFragment(line.response_preview, 400)}`)
      }
    } else if (line.kind === 'tool_span') {
      steps += 1
      const args = stringifyFragment(line.args, 200)
      const result = stringifyFragment(line.result, 300)
      const err = line.error_message ? ` ERROR=${stringifyFragment(line.error_message, 120)}` : ''
      parts.push(`[tool:${line.tool_name ?? 'unknown'}] ${args} → ${result}${err}`)
      toolCalls.push({
        name: line.tool_name ?? 'unknown',
        ok: !line.error_message && line.status !== 'error' && line.outcome !== 'error',
        ...(typeof line.duration_ms === 'number' ? { durationMs: line.duration_ms } : {}),
        // 参数指纹：死循环/冗余步按"同名同参"判定（无参数时留给签名退化为工具名）
        ...(args ? { argsSig: sha1Of(args).slice(0, 12) } : {}),
      })
    } else if (line.kind === 'subagent_span') {
      parts.push(`[subagent] ${stringifyFragment(line.summary ?? line.status, 120)}`)
    }
  }

  // 成本：token 分面 × 价目表（overlay/tokens 域单一事实源；未收录模型缺席不造数）。
  // 注意价目表币种由表级声明（现 CNY）——costUsd 字段值随表币种，basis 注明。
  const costUsd = tokensKnown ? costOfTokens(model, promptTokens, completionTokens) : undefined

  return {
    transcript: parts.join('\n') || undefined,
    efficiency: {
      ...(tokensKnown ? { tokens } : {}),
      ...(costUsd !== undefined ? { costUsd } : {}),
      ...(steps > 0 ? { steps } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(ttftMs !== undefined ? { ttftMs } : {}),
    },
    // 工具调用序列：零工具调用的轨迹产出空数组（有证据、无调用——与"证据缺席"区分）
    toolCalls,
  }
}

/** 读一个 session 的 L2 trace 证据；文件缺失/损坏返回空证据（如实，不伪造）。 */
export async function traceEvidenceProvider(sessionId: string): Promise<Evidence> {
  try {
    const raw = await readFile(join(traceDir(), `${sessionId}.jsonl`), 'utf8')
    const lines: TraceLine[] = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        lines.push(JSON.parse(trimmed) as TraceLine)
      } catch {
        // 半行（并发写竞态）：跳过该行
      }
    }
    return evidenceFromTraceLines(lines)
  } catch {
    return {}
  }
}

// ---------- 回放判分 ----------

export interface SampleInput {
  sessionId?: string
  /** span 级样本引用；与 sessionId 搭配，缺省表示整会话。 */
  spanRef?: string
  /** 内联证据（优先于 sessionId；测试与导入场景）。 */
  evidence?: Evidence
}

export interface ReplayRunInput {
  setId: string
  /** taskId → 样本列表（每项一个 sample；k=列表长度）。 */
  samples: Record<string, SampleInput[]>
  /** 显式开启后，缺失样本才从任务 origin 展开；显式样本始终优先。 */
  useOrigin?: boolean
  target?: EvalRun['target']
  crossValidate?: boolean
  /** 参照答案锚定检验（成本翻倍；争议题/新集首轮建议开）。 */
  referenceLeakCheck?: boolean
  note?: string
  actor?: string
  /** 同卷复评：按该版本快照判分（缺省=当前集）。 */
  setRevision?: number
  /** 期望考卷指纹（复评锚定）：解析出的考卷与期望不符则拒绝。 */
  expectedSetHash?: string
  /** 期望考卷版本（复评锚定）：与解析出的版本不符则拒绝。 */
  expectedRevision?: number
}

export interface RunnerDeps {
  judge: JudgeDeps
  outcomeCtx: OutcomeRunContext
  config?: EvalConfig
  evidenceProvider?: (sessionId: string) => Promise<Evidence>
  now?: () => number
}

export type ReplayRunResult =
  | { ok: true; run: EvalRun }
  | { ok: false; problems: string[] }

interface ResolvedSample extends SampleInput {
  fromOrigin?: boolean
}

function originSampleOf(task: EvalTask): { sample?: ResolvedSample; problem?: string } {
  const origin = task.origin
  if (!origin) return { problem: `任务 ${task.id} 缺少显式样本，也没有可自动绑定的 origin` }
  if (origin.source !== 'production_trace' || !origin.traceHash) {
    return { problem: `任务 ${task.id} 的 origin 不是带指纹的生产 trace，不能自动展开` }
  }
  const inspected = inspectTrace(origin.sessionId)
  if (!inspected.ok) return { problem: `任务 ${task.id} 的来源 trace 不可用：${inspected.reason ?? '未知原因'}` }
  if (inspected.format === 'unknown' || !inspected.complete) {
    return { problem: `任务 ${task.id} 的来源 trace 格式不可识别或不完整` }
  }
  if (inspected.traceHash !== origin.traceHash) {
    return { problem: `任务 ${task.id} 的来源 trace 已变化，需重新转题确认` }
  }
  // 复用 hash 校验同一次读取的 rows 构造证据：校验与判分不留二次读文件的漂移窗口。
  const sampled = origin.spanRef
    ? spanEvidenceFromRows(inspected.rows ?? [], origin.spanRef)
    : evidenceFromRows(inspected.rows ?? [])
  if ('reason' in sampled) {
    return { problem: `任务 ${task.id} 的来源证据采样失败：${sampled.reason}` }
  }
  const evidence = sampled.sample
  const meaningful = Boolean(
    evidence.transcript?.trim()
    || evidence.toolCalls?.length
    || (evidence.efficiency?.tokens ?? 0) > 0,
  )
  if (!meaningful) return { problem: `任务 ${task.id} 的来源 trace 没有可判分证据` }
  return {
    sample: {
      sessionId: origin.sessionId,
      ...(origin.spanRef ? { spanRef: origin.spanRef } : {}),
      evidence,
      fromOrigin: true,
    },
  }
}

/**
 * 执行回放判分运行：逐 task 逐 sample 组装证据 → 判分管线 → outcome 校验 →
 * 聚合（pass@k / 四层 / risk 一票否决 / unknown 诊断）→ 落库。
 * 密封集防探测：每调用方尝试超限直接拒绝（store 层计数）。
 */
export async function runReplayEval(input: ReplayRunInput, deps: RunnerDeps): Promise<ReplayRunResult> {
  const config = deps.config ?? loadEvalConfig()
  const now = deps.now ?? Date.now
  const current = getSet(input.setId)
  if (!current) return { ok: false, problems: [`评测集不存在：${input.setId}`] }

  // 同卷复评：按运行时版本快照判分，不读当前集内容（改题不改变历史口径）。
  let set = current
  if (input.setRevision !== undefined) {
    const frozen = getSetRevision(input.setId, input.setRevision)
    if (!frozen) {
      return { ok: false, problems: [`考卷版本不存在：${input.setId} r${input.setRevision}（历史版本未留档，无法同卷复评）`] }
    }
    set = { ...current, revision: frozen.revision, contentHash: frozen.contentHash, tasks: frozen.tasks }
  }
  if (input.expectedRevision !== undefined && set.revision !== input.expectedRevision) {
    return { ok: false, problems: [`考卷版本不符：期望 r${input.expectedRevision}，实际 r${set.revision}`] }
  }
  if (input.expectedSetHash !== undefined && set.contentHash !== input.expectedSetHash) {
    return { ok: false, problems: ['评测集已改版：试卷指纹与基准运行不一致，拒绝复评（须使用同一版本）'] }
  }

  if (set.sealed) {
    if (input.useOrigin) return { ok: false, problems: ['密封集不支持按 origin 自动展开（防止借来源引用探测题库）'] }
    const used = sealedAttemptCount(set.id, input.actor ?? 'anonymous')
    if (used >= config.sealedMaxAttempts) {
      return { ok: false, problems: [`密封集尝试上限（每调用方 ${config.sealedMaxAttempts} 次，防探测；已用 ${used}）`] }
    }
  }
  const rawSamples = input.samples ?? {}
  const sampleKeys = Object.keys(rawSamples)
  if (!input.useOrigin && sampleKeys.length === 0) return { ok: false, problems: ['samples 至少覆盖 1 个任务'] }

  const unknownTasks = sampleKeys.filter((taskId) => !set.tasks.some((t) => t.id === taskId))
  if (unknownTasks.length) return { ok: false, problems: [`samples 引用了不存在的任务：${unknownTasks.join(',')}`] }

  const resolvedSamples: Record<string, ResolvedSample[]> = {}
  const sourceProblems: string[] = []
  let hasExplicit = false
  let hasOrigin = false
  for (const task of set.tasks) {
    const explicit = rawSamples[task.id] ?? []
    if (explicit.length > 0) {
      resolvedSamples[task.id] = explicit
      hasExplicit = true
      continue
    }
    if (!input.useOrigin) {
      resolvedSamples[task.id] = []
      continue
    }
    const resolved = originSampleOf(task)
    if (resolved.problem) {
      sourceProblems.push(resolved.problem)
      continue
    }
    resolvedSamples[task.id] = resolved.sample ? [resolved.sample] : []
    hasOrigin = true
  }
  if (sourceProblems.length) return { ok: false, problems: sourceProblems }
  if (input.useOrigin && !Object.values(resolvedSamples).some((samples) => samples.length > 0)) {
    return { ok: false, problems: ['没有可判分的显式样本或 origin 来源'] }
  }

  const runStartedAt = now()
  const evidenceProvider = deps.evidenceProvider ?? traceEvidenceProvider
  const attempts: Attempt[] = []

  for (const task of set.tasks) {
    const samples = resolvedSamples[task.id] ?? []
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i]
      // 显式样本带 spanRef：按 span 取证（与证据端点/报告同一投影），不得偷读整会话——
      // 否则整会话其他内容撑过断言却被呈现为「该 span 已验证」。
      const evidence: Evidence = sample.evidence
        ?? (sample.sessionId && sample.spanRef
          ? (sampleSpanFromTrace(sample.sessionId, sample.spanRef).sample ?? {})
          : sample.sessionId ? await evidenceProvider(sample.sessionId) : {})
      const judged = await judgeAttempt(task, evidence, deps.judge, {
        crossValidate: input.crossValidate,
        referenceLeakCheck: input.referenceLeakCheck,
      })
      const attempt: Attempt = {
        taskId: task.id,
        sampleIdx: i + 1,
        ...(sample.sessionId ? { sessionId: sample.sessionId } : {}),
        ...(sample.spanRef ? { spanRef: sample.spanRef } : {}),
        verdicts: judged.verdicts,
        judgeMeta: judged.judgeMeta,
        ...(evidence.efficiency ? { efficiency: evidence.efficiency } : {}),
        ...(evidence.toolCalls ? { toolCalls: evidence.toolCalls } : {}),
        judgedAt: now(),
      }
      if (task.outcome) {
        const outcomeCtx: OutcomeRunContext = { ...deps.outcomeCtx, runStartedAt }
        const result = await runOutcomeCheck(task.outcome, outcomeCtx)
        attempt.outcome = { verifier: task.outcome.verifier, ok: result.ok, ...(result.detail ? { detail: result.detail } : {}) }
        // 终态详情回注证据面（供报告与后续判定复核）
        attempt.outcome.detail = result.detail
      }
      attempts.push(attempt)
    }
  }

  const maxK = Math.max(0, ...set.tasks.map((t) => resolvedSamples[t.id]?.length ?? 0))
  const evidenceMode = hasOrigin ? (hasExplicit ? 'mixed' as const : 'origin' as const) : 'explicit' as const
  const run: EvalRun = {
    id: `erun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    setId: set.id,
    // 资产锚点（百度轮 B1）：钉住运行时集内容指纹，报告期比对示警「集已改版」
    setHash: set.contentHash,
    setRevision: set.revision,
    target: input.target ?? {},
    k: maxK,
    status: 'done',
    evidenceMode,
    attempts,
    aggregates: {} as EvalRun['aggregates'],
    createdAt: now(),
    ...(input.actor ? { createdBy: input.actor } : {}),
    ...(input.note ? { note: input.note } : {}),
  }
  aggregateRun(set, run, config)
  appendRun(run)
  return { ok: true, run }
}
