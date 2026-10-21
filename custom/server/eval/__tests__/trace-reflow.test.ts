// overlay[eval] 生产轨迹转回归守门（2026-10-21 生产失败回流轮）。
// 锁定：人工确认 + 证据指纹 + 幂等入库；失败时不得留下半任务。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { originKeyOf } from '../origin'
import { reflowTraceToSet, type ReflowTraceInput } from '../trace-reflow'
import { _useStoreDirForTests, createSet, getSet, listSets, sealSet } from '../store'
import { sampleFromTrace, sampleSpanFromTrace } from '../trace-sampler'

let storeDir: string
let traceDir: string

beforeEach(() => {
  storeDir = mkdtempSync(join(tmpdir(), 'eval-trace-reflow-store-'))
  traceDir = mkdtempSync(join(tmpdir(), 'eval-trace-reflow-trace-'))
  _useStoreDirForTests(storeDir)
})

afterEach(() => {
  rmSync(storeDir, { recursive: true, force: true })
  rmSync(traceDir, { recursive: true, force: true })
})

function writeTrace(sessionId: string, lines: unknown[]): void {
  writeFileSync(join(traceDir, `${sessionId}.jsonl`), `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8')
}

const SESSION_TRACE = [
  { type: 'header', session_id: 'prod-fail-1', started_at: 1000, model: 'glm-5' },
  { type: 'chunk', kind: 'llm_span', phase: 'pre', api_request_id: 'req-1', request_messages: [{ role: 'user', content: '修复登录失败' }] },
  { type: 'chunk', kind: 'llm_span', phase: 'post', api_request_id: 'req-1', usage: { input_tokens: 120, output_tokens: 30 }, response_preview: '我会先检查登录日志' },
  { type: 'chunk', kind: 'tool_span', tool_call_id: 'tc-1', api_request_id: 'req-1', tool_name: 'read_file', status: 'ok', duration_ms: 12, args: { path: 'auth.ts' } },
  { type: 'chunk', kind: 'tool_span', tool_call_id: 'tc-2', api_request_id: 'req-1', tool_name: 'run_tests', status: 'error', error_message: 'login spec failed', duration_ms: 200, args: { cmd: 'npm test -- login' } },
  { type: 'trailer', session_id: 'prod-fail-1', duration_ms: 5000 },
]

function task(overrides: Record<string, unknown> = {}): ReflowTraceInput['task'] {
  return {
    problem: '生产会话修复登录失败时测试命令报错',
    expectedBehavior: '先定位失败原因，再用最小修复通过登录测试',
    rubric: [{ id: 'a1', text: '是否运行了登录相关测试并如实报告失败', expect: 'yes', kind: 'trajectory' }],
    ...overrides,
  } as ReflowTraceInput['task']
}

function input(overrides: Partial<ReflowTraceInput> = {}): ReflowTraceInput {
  const sessionId = overrides.sessionId ?? 'prod-fail-1'
  const preview = sampleFromTrace(sessionId, { tracesDir: traceDir })
  expect(preview.ok).toBe(true)
  expect(preview.meta?.traceHash).toMatch(/^[a-f0-9]{64}$/)
  if (preview.sessionId === 'prod-fail-1') expect(preview.meta?.complete).toBe(true)
  return {
    sessionId,
    expectedTraceHash: preview.meta!.traceHash!,
    task: task(),
    ...overrides,
  }
}

describe('生产轨迹转回归样本', () => {
  it('完整 session 转题到默认回归库，origin 只保存引用和指纹', () => {
    writeTrace('prod-fail-1', SESSION_TRACE)
    const result = reflowTraceToSet(input(), { tracesDir: traceDir })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.created).toBe(true)
    expect(result.set.name).toBe('回归样本库')
    expect(result.set.track).toBe('e2e')
    const saved = getSet(result.set.id)
    const createdTask = saved?.tasks.find((t) => t.id === result.taskId)
    expect(saved?.revision).toBe(1)
    expect(createdTask?.origin).toMatchObject({
      source: 'production_trace',
      sessionId: 'prod-fail-1',
      traceHash: input().expectedTraceHash,
    })
    expect(createdTask?.origin).not.toHaveProperty('runId')
    expect(JSON.stringify(createdTask?.origin)).not.toContain('login spec failed')
  })

  it('相同来源和任务定义幂等返回，不增加修订号；不同定义返回冲突', () => {
    writeTrace('prod-fail-1', SESSION_TRACE)
    const first = reflowTraceToSet(input(), { tracesDir: traceDir })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = reflowTraceToSet(input(), { tracesDir: traceDir })
    expect(second).toMatchObject({ ok: true, created: false, taskId: first.taskId })
    expect(getSet(first.set.id)?.revision).toBe(1)

    const changed = reflowTraceToSet(input({ task: task({ expectedBehavior: '另一个期望' }) }), { tracesDir: traceDir })
    expect(changed).toMatchObject({ ok: false, code: 'origin_conflict' })
    expect(getSet(first.set.id)?.tasks).toHaveLength(1)
  })

  it('同一 session 的不同 span 是不同任务，span 默认进 Process 轨', () => {
    writeTrace('prod-fail-1', SESSION_TRACE)
    const spanPreview = sampleSpanFromTrace('prod-fail-1', 'tc-2', { tracesDir: traceDir })
    expect(spanPreview.ok).toBe(true)
    const first = reflowTraceToSet(input({ spanRef: 'tc-1', expectedTraceHash: spanPreview.meta!.traceHash! }), { tracesDir: traceDir })
    const second = reflowTraceToSet(input({ spanRef: 'tc-2', expectedTraceHash: spanPreview.meta!.traceHash! }), { tracesDir: traceDir })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.taskId).not.toBe(first.taskId)
    expect(second.set.track).toBe('process')
    expect(second.set.tasks.map((t) => t.origin && originKeyOf(t.origin))).toHaveLength(2)
  })

  it('预览后 hash 漂移返回冲突且不写任务', () => {
    writeTrace('prod-fail-1', SESSION_TRACE)
    const stale = input()
    writeTrace('prod-fail-1', [...SESSION_TRACE.slice(0, -1), { type: 'chunk', kind: 'tool_span', tool_call_id: 'tc-3', tool_name: 'git_status', status: 'ok', duration_ms: 3 }, SESSION_TRACE.at(-1)])
    const result = reflowTraceToSet(stale, { tracesDir: traceDir })
    expect(result).toMatchObject({ ok: false, code: 'trace_hash_mismatch' })
    expect(listSets()).toHaveLength(0)
  })

  it('非法引用、缺 trailer、OTel 与空证据均拒绝且不写任务', () => {
    writeTrace('incomplete', SESSION_TRACE.slice(0, -1))
    writeTrace('otel', [{ otelFormat: true, traceId: 'otel' }])
    writeTrace('empty', [
      { type: 'header', session_id: 'empty', started_at: 1 },
      { type: 'trailer', session_id: 'empty', duration_ms: 1 },
    ])

    const badId = reflowTraceToSet({ sessionId: '../secret', expectedTraceHash: '0'.repeat(64), task: task() }, { tracesDir: traceDir })
    expect(badId.ok).toBe(false)

    const incomplete = reflowTraceToSet(input({ sessionId: 'incomplete' }), { tracesDir: traceDir })
    expect(incomplete).toMatchObject({ ok: false, code: 'trace_incomplete' })

    const otel = reflowTraceToSet(input({ sessionId: 'otel' }), { tracesDir: traceDir })
    expect(otel).toMatchObject({ ok: false, code: 'trace_format_unsupported' })

    const empty = reflowTraceToSet(input({ sessionId: 'empty' }), { tracesDir: traceDir })
    expect(empty).toMatchObject({ ok: false, code: 'trace_evidence_empty' })
    expect(listSets()).toHaveLength(0)
  })

  it('显式开放目标集可接收生产题；密封目标与密封默认库拒绝', () => {
    writeTrace('prod-fail-1', SESSION_TRACE)
    const target = createSet({ name: '专项回归', track: 'e2e', tasks: [{ id: 'base', ...task() }] }, 'tester')
    expect(target.ok).toBe(true)
    if (!target.ok) return
    const intoTarget = reflowTraceToSet(input({ targetSetId: target.set.id }), { tracesDir: traceDir })
    expect(intoTarget).toMatchObject({ ok: true, created: true })
    expect(getSet(target.set.id)?.revision).toBe(2)

    const sealed = createSet({ name: '密封目标', track: 'e2e', tasks: [{ id: 'base', ...task() }] }, 'tester')
    if (!sealed.ok) throw new Error('sealed target fixture failed')
    sealSet(sealed.set.id, 'tester')
    const rejected = reflowTraceToSet(input({ targetSetId: sealed.set.id }), { tracesDir: traceDir })
    expect(rejected).toMatchObject({ ok: false, code: 'target_sealed' })

    const defaultSet = createSet({ name: '回归样本库', track: 'e2e', tasks: [{ id: 'base', ...task() }] }, 'tester')
    if (!defaultSet.ok) throw new Error('default fixture failed')
    sealSet(defaultSet.set.id, 'tester')
    const sealedDefault = reflowTraceToSet(input({ sessionId: 'prod-fail-1' }), { tracesDir: traceDir })
    expect(sealedDefault).toMatchObject({ ok: false, code: 'target_sealed' })
  })
})
