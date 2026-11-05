// 统一终止码映射（2026-11-05 AI Native 吸收批 T2）：四族词表 → 十七码。
// 未知输入一律 UNKNOWN 不抛错；isNormalExit/isRetryableCode 分组语义钉死。
import { describe, it, expect } from 'vitest'
import {
  LOOP_TERMINATION_CODES,
  fromGateVerdict, fromGraphFinishReason, fromKanbanOutcome, fromTurnExitReason,
  isNormalExit, isRetryableCode,
} from '../termination'

describe('十七码词表', () => {
  it('恰 17 个码且无重复', () => {
    expect(LOOP_TERMINATION_CODES.length).toBe(17)
    expect(new Set(LOOP_TERMINATION_CODES).size).toBe(17)
  })
})

describe('fromGateVerdict（qgate 六态）', () => {
  it.each([
    ['PASS', 'SUCCESS'], ['FAIL', 'VALIDATION_FAIL'], ['CONDITIONAL', 'PARTIAL_SUCCESS'],
    ['INCONCLUSIVE', 'LOW_CONFIDENCE'], ['WAIVED', 'PARTIAL_SUCCESS'], ['NOT_APPLICABLE', 'SUCCESS'],
  ])('%s → %s', (v, want) => expect(fromGateVerdict(v)).toBe(want))
  it('未知/缺席 → UNKNOWN 不抛错', () => {
    expect(fromGateVerdict('WEIRD')).toBe('UNKNOWN')
    expect(fromGateVerdict(null)).toBe('UNKNOWN')
    expect(fromGateVerdict(undefined)).toBe('UNKNOWN')
    expect(fromGateVerdict('')).toBe('UNKNOWN')
  })
})

describe('fromGraphFinishReason（graph 七值）', () => {
  it.each([
    ['end-condition', 'SUCCESS'], ['node-end', 'SUCCESS'], ['no-next-nodes', 'SUCCESS'],
    ['node-error', 'REPEATED_FAILURE'], ['budget-exceeded', 'BUDGET_EXHAUSTED'],
    ['duration-exceeded', 'TIMEOUT'], ['max-steps-exceeded', 'BUDGET_EXHAUSTED'],
  ])('%s → %s', (v, want) => expect(fromGraphFinishReason(v)).toBe(want))
  it('未知 → UNKNOWN', () => expect(fromGraphFinishReason('sudden-death')).toBe('UNKNOWN'))
})

describe('fromKanbanOutcome（kanban 八值）', () => {
  it.each([
    ['completed', 'SUCCESS'], ['blocked', 'MISSING_INFO'], ['crashed', 'REPEATED_FAILURE'],
    ['timed_out', 'TIMEOUT'], ['spawn_failed', 'UNSAFE_DETECTION'], ['gave_up', 'IMPOSSIBLE'],
    ['reclaimed', 'PARTIAL_SUCCESS'],
  ])('%s → %s', (v, want) => expect(fromKanbanOutcome(v)).toBe(want))
  it('null（在途/未知）→ UNKNOWN', () => expect(fromKanbanOutcome(null)).toBe('UNKNOWN'))
})

describe('fromTurnExitReason（turn_exit 前缀 + T5 新码）', () => {
  it.each([
    ['wall_clock_exhausted', 'TIMEOUT'],                                    // T5 补丁 753 新码
    ['max_iterations_reached(200/200)', 'BUDGET_EXHAUSTED'],
    ['empty_response_exhausted', 'LOW_CONFIDENCE'],
    ['all_retries_exhausted_no_response', 'REPEATED_FAILURE'],
    ['pending_tool_result', 'REPEATED_FAILURE'],
    ['interpreter_shutdown', 'UNSAFE_DETECTION'],
    ['local_processing_error(ValueError)', 'VALIDATION_FAIL'],
    ['repeated_outer_errors', 'REPEATED_FAILURE'],
    ['error_near_max_iterations', 'BUDGET_EXHAUSTED'],
    ['context_compression_timeout', 'CONTEXT_PRESSURE'],
    ['context_compression_exhausted', 'CONTEXT_PRESSURE'],
    ['ollama_runtime_context_too_small', 'CONTEXT_PRESSURE'],
    ['redirect_restart_limit_exceeded', 'PARTIAL_SUCCESS'],
    ['rebuilt_restart_limit_exceeded', 'PARTIAL_SUCCESS'],
    ['interrupted_during_api_call(3.2s elapsed)', 'MISSING_INFO'],
    ['unknown', 'UNKNOWN'],
  ])('%s → %s', (v, want) => expect(fromTurnExitReason(v)).toBe(want))
  it('未收录前缀 → UNKNOWN 不抛错', () => expect(fromTurnExitReason('brand_new_reason')).toBe('UNKNOWN'))
})

describe('语义分组', () => {
  it('正常退出四码', () => {
    for (const c of ['SUCCESS', 'PARTIAL_SUCCESS', 'IMPOSSIBLE', 'MISSING_INFO'] as const) {
      expect(isNormalExit(c), c).toBe(true)
    }
    expect(isNormalExit('TIMEOUT')).toBe(false)
  })
  it('可重试=环境类（预算/超时/重复失败/上下文/UNKNOWN 保守）', () => {
    for (const c of ['BUDGET_EXHAUSTED', 'TIMEOUT', 'REPEATED_FAILURE', 'CONTEXT_PRESSURE', 'UNKNOWN'] as const) {
      expect(isRetryableCode(c), c).toBe(true)
    }
  })
  it('不可重试=权限/不安全/规格类', () => {
    for (const c of ['PERMISSION_DENIED', 'UNSAFE_DETECTION', 'VALIDATION_FAIL', 'AMBIGUOUS_INTENT'] as const) {
      expect(isRetryableCode(c), c).toBe(false)
    }
  })
})

describe('collectTerminations（fail-soft 采集）', () => {
  it('账本缺席=面 available:false 不猜数', async () => {
    const { collectTerminations } = await import('../termination-collect')
    process.env.OVERLAY_REPO_ROOT = '/nonexistent-ainative-t2'
    try {
      const r = collectTerminations(7)
      const qgate = r.bySubsystem.find((f) => f.subsystem === 'qgate')
      expect(qgate?.available).toBe(false)
      expect(r.notes.some((n) => n.includes('graph run 面'))).toBe(true)
    } finally {
      delete process.env.OVERLAY_REPO_ROOT
    }
  })
})
