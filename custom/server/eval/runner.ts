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
import { aggregateRun } from './aggregate'
import { judgeAttempt, type JudgeDeps } from './judge'
import { runOutcomeCheck, type OutcomeRunContext } from './outcome'
import { appendRun, getSet, sealedAttemptCount } from './store'
import type { Attempt, Evidence, EvalConfig, EvalRun } from './types'
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

/** usage 对象 → 总 token（常见字段名防御式提取）。 */
function tokensOfUsage(usage: Record<string, unknown> | undefined): number | undefined {
  if (!usage) return undefined
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const total = num(usage.total_tokens) ?? num(usage.tokens)
  if (total !== null) return total
  const prompt = num(usage.prompt_tokens) ?? num(usage.input_tokens)
  const completion = num(usage.completion_tokens) ?? num(usage.output_tokens)
  if (prompt !== null || completion !== null) return (prompt ?? 0) + (completion ?? 0)
  return undefined
}

/** 解析 L2 trace JSONL 为证据（transcript 文本 + efficiency 指标）。导出供测试。 */
export function evidenceFromTraceLines(lines: TraceLine[]): Evidence {
  const parts: string[] = []
  let tokens = 0
  let tokensKnown = false
  let steps = 0
  let durationMs: number | undefined

  for (const line of lines) {
    if (line.type === 'trailer') {
      if (typeof line.duration_ms === 'number') durationMs = line.duration_ms
      if (line.outcome) parts.push(`[outcome] ${stringifyFragment(line.outcome, 300)}`)
      if (line.summary) parts.push(`[summary] ${stringifyFragment(line.summary, 500)}`)
      continue
    }
    if (line.type !== 'chunk') continue
    if (line.kind === 'llm_span' && line.phase === 'post') {
      const t = tokensOfUsage(line.usage)
      if (t !== undefined) {
        tokens += t
        tokensKnown = true
      }
      if (line.response_preview) {
        parts.push(`[assistant] ${stringifyFragment(line.response_preview, 400)}`)
      }
    } else if (line.kind === 'tool_span') {
      steps += 1
      const args = stringifyFragment(line.args, 200)
      const result = stringifyFragment(line.result, 300)
      const err = line.error_message ? ` ERROR=${stringifyFragment(line.error_message, 120)}` : ''
      parts.push(`[tool:${line.tool_name ?? 'unknown'}] ${args} → ${result}${err}`)
    } else if (line.kind === 'subagent_span') {
      parts.push(`[subagent] ${stringifyFragment(line.summary ?? line.status, 120)}`)
    }
  }

  return {
    transcript: parts.join('\n') || undefined,
    efficiency: {
      ...(tokensKnown ? { tokens } : {}),
      ...(steps > 0 ? { steps } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
    },
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
  /** 内联证据（优先于 sessionId；测试与导入场景）。 */
  evidence?: Evidence
}

export interface ReplayRunInput {
  setId: string
  /** taskId → 样本列表（每项一个 sample；k=列表长度）。 */
  samples: Record<string, SampleInput[]>
  target?: EvalRun['target']
  crossValidate?: boolean
  note?: string
  actor?: string
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

/**
 * 执行回放判分运行：逐 task 逐 sample 组装证据 → 判分管线 → outcome 校验 →
 * 聚合（pass@k / 四层 / risk 一票否决 / unknown 诊断）→ 落库。
 * 密封集防探测：每调用方尝试超限直接拒绝（store 层计数）。
 */
export async function runReplayEval(input: ReplayRunInput, deps: RunnerDeps): Promise<ReplayRunResult> {
  const config = deps.config ?? loadEvalConfig()
  const now = deps.now ?? Date.now
  const set = getSet(input.setId)
  if (!set) return { ok: false, problems: [`评测集不存在：${input.setId}`] }
  if (set.sealed) {
    const used = sealedAttemptCount(set.id, input.actor ?? 'anonymous')
    if (used >= config.sealedMaxAttempts) {
      return { ok: false, problems: [`密封集尝试上限（每调用方 ${config.sealedMaxAttempts} 次，防探测；已用 ${used}）`] }
    }
  }
  const sampleKeys = Object.keys(input.samples ?? {})
  if (sampleKeys.length === 0) return { ok: false, problems: ['samples 至少覆盖 1 个任务'] }

  const unknownTasks = sampleKeys.filter((taskId) => !set.tasks.some((t) => t.id === taskId))
  if (unknownTasks.length) return { ok: false, problems: [`samples 引用了不存在的任务：${unknownTasks.join(',')}`] }

  const runStartedAt = now()
  const evidenceProvider = deps.evidenceProvider ?? traceEvidenceProvider
  const attempts: Attempt[] = []

  for (const task of set.tasks) {
    const samples = input.samples[task.id] ?? []
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i]
      const evidence: Evidence = sample.evidence ?? (sample.sessionId ? await evidenceProvider(sample.sessionId) : {})
      const judged = await judgeAttempt(task, evidence, deps.judge, { crossValidate: input.crossValidate })
      const attempt: Attempt = {
        taskId: task.id,
        sampleIdx: i + 1,
        ...(sample.sessionId ? { sessionId: sample.sessionId } : {}),
        verdicts: judged.verdicts,
        judgeMeta: judged.judgeMeta,
        ...(evidence.efficiency ? { efficiency: evidence.efficiency } : {}),
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

  const maxK = Math.max(0, ...set.tasks.map((t) => input.samples[t.id]?.length ?? 0))
  const run: EvalRun = {
    id: `erun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    setId: set.id,
    target: input.target ?? {},
    k: maxK,
    status: 'done',
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
