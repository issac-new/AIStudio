// overlay/loop 域：统一 Loop 终止原因码（2026-11-05 AI Native 吸收批 T2）。
//
// 文章判据（《AI Native 工程体系（四）》17 种程序化终止码）：「模型判断是建议，
// 程序化终止条件是法律」。本仓现状=四族终态词表互不映射（qgate 六态 / graph
// finishReason 七值 / kanban outcome 八值 / turn_exit 十一前缀），复盘无法机器回答
// 「这次 loop 为什么出来」。本模块是映射视图层（决策 D-2：不替换既有枚举，不动
// 消费者语义），未知输入一律 UNKNOWN 不抛错。
//
// 语义分组（供调度/复盘消费）：
//  - 正常退出（isNormalExit）：SUCCESS / PARTIAL_SUCCESS / IMPOSSIBLE / MISSING_INFO
//  - 可重试（isRetryableCode）：预算/超时/重复失败/上下文压力（环境类，重试有意义）
//  - 不可重试：权限/不安全/低置信/源冲突（须人工或规格修正，重试即浪费）

export const LOOP_TERMINATION_CODES = [
  'SUCCESS', 'PARTIAL_SUCCESS', 'IMPOSSIBLE', 'MISSING_INFO',
  'BUDGET_EXHAUSTED', 'TIMEOUT', 'REPEATED_FAILURE', 'CONTEXT_PRESSURE',
  'PERMISSION_DENIED', 'UNSAFE_DETECTION',
  'LOW_CONFIDENCE', 'SOURCE_CONFLICT', 'VALIDATION_FAIL', 'AMBIGUOUS_INTENT',
  'CONFIRM_REQUIRED', 'REVIEW_REQUIRED',
  'UNKNOWN',
] as const

export type LoopTerminationCode = (typeof LOOP_TERMINATION_CODES)[number]

const NORMAL = new Set<LoopTerminationCode>(['SUCCESS', 'PARTIAL_SUCCESS', 'IMPOSSIBLE', 'MISSING_INFO'])
const RETRYABLE = new Set<LoopTerminationCode>([
  'BUDGET_EXHAUSTED', 'TIMEOUT', 'REPEATED_FAILURE', 'CONTEXT_PRESSURE', 'UNKNOWN',
])

export function isNormalExit(code: LoopTerminationCode): boolean {
  return NORMAL.has(code)
}

/** 重试是否有意义（环境类=true；权限/不安全/规格类=false；UNKNOWN 保守 true——
 *  调度面自行结合次数上限）。 */
export function isRetryableCode(code: LoopTerminationCode): boolean {
  return RETRYABLE.has(code)
}

// ── 四族映射（局部联合类型，避免跨域 import qgate 类型包；与既有枚举的对应
//    关系写在注释里，词表变更时同步这里）──

/** qgate GateVerdict（custom/qgate/src/core/types.ts:5-11：
 *  PASS|FAIL|CONDITIONAL|INCONCLUSIVE|WAIVED|NOT_APPLICABLE）→ 终止码。 */
export function fromGateVerdict(v: string | null | undefined): LoopTerminationCode {
  switch (v) {
    case 'PASS': return 'SUCCESS'
    case 'FAIL': return 'VALIDATION_FAIL'
    case 'CONDITIONAL': return 'PARTIAL_SUCCESS'
    case 'INCONCLUSIVE': return 'LOW_CONFIDENCE'
    case 'WAIVED': return 'PARTIAL_SUCCESS'
    case 'NOT_APPLICABLE': return 'SUCCESS'
    default: return 'UNKNOWN'
  }
}

/** graph finishReason（custom/server/loop/graph/types.ts:213-216：
 *  end-condition|node-end|no-next-nodes|node-error|budget-exceeded|
 *  duration-exceeded|max-steps-exceeded）→ 终止码。 */
export function fromGraphFinishReason(r: string | null | undefined): LoopTerminationCode {
  switch (r) {
    case 'end-condition': return 'SUCCESS'
    case 'node-end': return 'SUCCESS'
    case 'no-next-nodes': return 'SUCCESS'
    case 'node-error': return 'REPEATED_FAILURE'
    case 'budget-exceeded': return 'BUDGET_EXHAUSTED'
    case 'duration-exceeded': return 'TIMEOUT'
    case 'max-steps-exceeded': return 'BUDGET_EXHAUSTED'
    default: return 'UNKNOWN'
  }
}

/** kanban outcome（runtime/hermes_cli/kanban_db.py:1111-1112：
 *  completed|blocked|crashed|timed_out|spawn_failed|gave_up|reclaimed|null）→ 终止码。 */
export function fromKanbanOutcome(o: string | null | undefined): LoopTerminationCode {
  switch (o) {
    case 'completed': return 'SUCCESS'
    case 'blocked': return 'MISSING_INFO'
    case 'crashed': return 'REPEATED_FAILURE'
    case 'timed_out': return 'TIMEOUT'
    case 'spawn_failed': return 'UNSAFE_DETECTION'
    case 'gave_up': return 'IMPOSSIBLE'
    case 'reclaimed': return 'PARTIAL_SUCCESS'
    default: return 'UNKNOWN' // null（在途/未知）
  }
}

/** turn_exit_reason 前缀（vendor/hermes-agent/agent/turn_failure_copy.py:120-138
 *  十一前缀 + max_iterations_reached + wall_clock_exhausted[T5]）→ 终止码。 */
export function fromTurnExitReason(r: string | null | undefined): LoopTerminationCode {
  const s = String(r ?? '')
  if (!s) return 'UNKNOWN'
  if (s.startsWith('wall_clock_exhausted')) return 'TIMEOUT'
  if (s.startsWith('max_iterations_reached')) return 'BUDGET_EXHAUSTED'
  if (s.startsWith('empty_response_exhausted')) return 'LOW_CONFIDENCE'
  if (s.startsWith('all_retries_exhausted_no_response')) return 'REPEATED_FAILURE'
  if (s.startsWith('pending_tool_result')) return 'REPEATED_FAILURE'
  if (s.startsWith('interpreter_shutdown')) return 'UNSAFE_DETECTION'
  if (s.startsWith('local_processing_error')) return 'VALIDATION_FAIL'
  if (s.startsWith('repeated_outer_errors')) return 'REPEATED_FAILURE'
  if (s.startsWith('error_near_max_iterations')) return 'BUDGET_EXHAUSTED'
  if (s.startsWith('context_compression_timeout')) return 'CONTEXT_PRESSURE'
  if (s.startsWith('context_compression_exhausted')) return 'CONTEXT_PRESSURE'
  if (s.startsWith('ollama_runtime_context_too_small')) return 'CONTEXT_PRESSURE'
  if (s.startsWith('redirect_restart_limit_exceeded')) return 'PARTIAL_SUCCESS'
  if (s.startsWith('rebuilt_restart_limit_exceeded')) return 'PARTIAL_SUCCESS'
  if (s.startsWith('interrupted')) return 'MISSING_INFO'
  if (s === 'unknown') return 'UNKNOWN'
  return 'UNKNOWN'
}
