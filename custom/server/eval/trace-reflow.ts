// overlay[eval] 生产 trace 转回归题编排（2026-10-21 生产失败回流轮）。
// 只复用 EvalSet 资产原语与严格采样器：不复制存储，不把原始证据写进 origin。
import { originKeyOf, taskIdForOrigin, type ProductionTraceReflowOrigin } from './origin'
import {
  appendTasksToSet,
  createSet,
  getSet,
  listSets,
  REGRESSION_SET_NAME,
} from './store'
import { inspectTrace, sampleFromTrace, sampleSpanFromTrace } from './trace-sampler'
import type { EvalSet, EvalTask } from './types'

export type TraceReflowTask = Omit<EvalTask, 'id' | 'origin'> & { id?: string }

export interface ReflowTraceInput {
  sessionId: string
  spanRef?: string
  expectedTraceHash: string
  task: TraceReflowTask
  targetSetId?: string
  actor?: string
}

export type TraceReflowErrorCode =
  | 'invalid_input'
  | 'trace_unavailable'
  | 'trace_format_unsupported'
  | 'trace_incomplete'
  | 'trace_hash_mismatch'
  | 'trace_evidence_empty'
  | 'target_not_found'
  | 'target_sealed'
  | 'origin_conflict'
  | 'task_invalid'

export type ReflowTraceResult =
  | { ok: true; created: boolean; taskId: string; set: EvalSet }
  | { ok: false; code: TraceReflowErrorCode; problems: string[] }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function taskDefinition(task: TraceReflowTask | EvalTask): string {
  const { id: _id, origin: _origin, ...definition } = task as EvalTask
  return canonical(definition)
}

function evidenceMeaningful(sample: { transcript?: string; toolCalls?: unknown[]; efficiency?: { tokens?: number } } | undefined): boolean {
  if (!sample) return false
  return Boolean(sample.transcript?.trim() || sample.toolCalls?.length || (sample.efficiency?.tokens ?? 0) > 0)
}

/** 生产 session/span → 回归题。预览 hash 必须与服务端重采样结果一致。 */
export function reflowTraceToSet(
  input: ReflowTraceInput,
  opts: { tracesDir?: string } = {},
): ReflowTraceResult {
  const sessionId = input.sessionId?.trim() ?? ''
  const spanRef = input.spanRef?.trim() || undefined
  if (!sessionId || !/^[a-f0-9]{64}$/.test(input.expectedTraceHash ?? '') || !input.task) {
    return { ok: false, code: 'invalid_input', problems: ['sessionId、expectedTraceHash 与 task 必填'] }
  }

  const inspected = inspectTrace(sessionId, opts)
  if (!inspected.ok) return { ok: false, code: 'trace_unavailable', problems: [inspected.reason ?? 'trace 不可用'] }
  if (inspected.format !== 'legacy') {
    return { ok: false, code: 'trace_format_unsupported', problems: ['OTel/未知格式暂不支持转回归题'] }
  }
  if (!inspected.complete) {
    return { ok: false, code: 'trace_incomplete', problems: ['trace 缺少匹配 header/trailer，会话可能仍在写入'] }
  }
  if (inspected.traceHash !== input.expectedTraceHash) {
    return { ok: false, code: 'trace_hash_mismatch', problems: ['trace 在预览后已变化，请重新预览确认'] }
  }

  const sampled = spanRef
    ? sampleSpanFromTrace(sessionId, spanRef, opts)
    : sampleFromTrace(sessionId, opts)
  if (!sampled.ok || !sampled.sample) {
    return { ok: false, code: 'trace_unavailable', problems: [sampled.reason ?? 'trace 采样失败'] }
  }
  if (!evidenceMeaningful(sampled.sample)) {
    return { ok: false, code: 'trace_evidence_empty', problems: ['trace 没有可用于判分的证据'] }
  }

  const targetMeta = input.targetSetId
    ? listSets().find((set) => set.id === input.targetSetId)
    : listSets().find((set) => set.name === REGRESSION_SET_NAME)
  if (input.targetSetId && !targetMeta) {
    return { ok: false, code: 'target_not_found', problems: [`目标评测集不存在：${input.targetSetId}`] }
  }
  if (targetMeta?.sealed) {
    return { ok: false, code: 'target_sealed', problems: ['目标评测集已密封，不可追加生产回归题'] }
  }

  const origin: ProductionTraceReflowOrigin = {
    source: 'production_trace',
    sessionId,
    ...(spanRef ? { spanRef } : {}),
    traceHash: input.expectedTraceHash,
    at: Date.now(),
  }
  const taskId = taskIdForOrigin(origin)
  const incoming: EvalTask = {
    ...input.task,
    id: taskId,
    origin,
  }

  const existingTarget = targetMeta ? getSet(targetMeta.id) : undefined
  const duplicate = existingTarget?.tasks.find((candidate) => candidate.origin && originKeyOf(candidate.origin) === originKeyOf(origin))
  if (duplicate) {
    if (taskDefinition(duplicate) === taskDefinition(incoming)) {
      return { ok: true, created: false, taskId: duplicate.id, set: existingTarget! }
    }
    return { ok: false, code: 'origin_conflict', problems: ['同一生产证据已有不同任务定义，请修改原题或选择其他证据'] }
  }
  if (existingTarget?.tasks.some((candidate) => candidate.id === taskId)) {
    return { ok: false, code: 'origin_conflict', problems: ['生产来源键与既有任务 ID 冲突'] }
  }

  if (!existingTarget) {
    const created = createSet({
      name: REGRESSION_SET_NAME,
      track: spanRef ? 'process' : 'e2e',
      tasks: [incoming],
    }, input.actor)
    if (created.ok === false) {
      const failure = created as { ok: false; problems: string[] }
      return { ok: false, code: 'task_invalid', problems: failure.problems }
    }
    return { ok: true, created: true, taskId, set: created.set }
  }

  const appended = appendTasksToSet(existingTarget.id, [incoming])
  if (appended.ok === false) {
    const failure = appended as { ok: false; problems: string[] }
    return { ok: false, code: 'task_invalid', problems: failure.problems }
  }
  if (appended.appended !== 1) {
    return { ok: false, code: 'origin_conflict', problems: ['任务未追加，来源键可能已存在'] }
  }
  return { ok: true, created: true, taskId, set: appended.set }
}
