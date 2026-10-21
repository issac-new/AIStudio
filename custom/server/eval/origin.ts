// overlay[eval] 回流来源单一事实源（2026-10-21 生产失败回流轮）。
// 兼容旧 EvalRun 回流（无 source 字段）与生产 trace 转题；只存引用，不存证据原文。
import { createHash } from 'node:crypto'

export interface EvalRunReflowOrigin {
  source?: 'eval_run'
  runId: string
  taskId: string
  sampleIdx?: number
  sessionId?: string
  spanRef?: string
  traceHash?: string
  at: number
}

export interface ProductionTraceReflowOrigin {
  source: 'production_trace'
  sessionId: string
  spanRef?: string
  traceHash: string
  at: number
}

export type ReflowOrigin = EvalRunReflowOrigin | ProductionTraceReflowOrigin

/** 规范化来源键：时间、actor 与证据指纹不参与幂等；span 缺省表示整 session。 */
export function originKeyOf(origin: ReflowOrigin): string {
  if (origin.source === 'production_trace') {
    return `production_trace:${origin.sessionId}:${origin.spanRef ?? ''}`
  }
  return `eval_run:${origin.runId}:${origin.taskId}:${origin.sampleIdx ?? 0}`
}

/** 稳定任务 ID：sha256 前 20 位足够隔离本域来源键，同时保持人工可读前缀。 */
export function taskIdForOrigin(origin: ReflowOrigin): string {
  const digest = createHash('sha256').update(originKeyOf(origin), 'utf8').digest('hex')
  return `re-${digest.slice(0, 20)}`
}
