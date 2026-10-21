// overlay[eval] OTel trace 消费守门（2026-10-21 挂账清偿批次 B）：
// 采样器把 OTel JSONL 转 legacy 投影出 Evidence；hash 仍取原始字节；
// 格式判定与 controllers/hermes/trace 单一事实源（同一严格谓词）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inspectTrace, sampleFromTrace, sampleSpanFromTrace } from '../trace-sampler'
import { reflowTraceToSet } from '../trace-reflow'
import { _useStoreDirForTests } from '../store'

let traceDir: string
let storeDir: string

beforeEach(() => {
  traceDir = mkdtempSync(join(tmpdir(), 'otel-sampler-trace-'))
  storeDir = mkdtempSync(join(tmpdir(), 'otel-sampler-store-'))
  _useStoreDirForTests(storeDir)
  process.env.EVAL_TRACE_DIR = traceDir
  process.env.HERMES_TRACES_DIR = traceDir
})

afterEach(() => {
  delete process.env.EVAL_TRACE_DIR
  delete process.env.HERMES_TRACES_DIR
  rmSync(traceDir, { recursive: true, force: true })
  rmSync(storeDir, { recursive: true, force: true })
})

// 夹具对齐 run-trace 插件 otel_formatter 的真实输出形态。
const OTEL_ROWS = [
  { otelFormat: true, traceId: 'otel-1', spanId: 'session-otel-1', kind: 'SERVER', name: 'invoke_agent', startTime: 1_000_000,
    attributes: { 'gen_ai.operation.name': 'invoke_agent', 'gen_ai.conversation.id': 'otel-1', 'agentscope.session.id': 'otel-1', 'gen_ai.request.model': 'glm-5' } },
  { otelFormat: true, traceId: 'otel-1', spanId: 'req-9', parentSpanId: 'session-otel-1', kind: 'CLIENT', name: 'chat', startTime: 2_000_000, endTime: 3_000_000, durationMs: 1000,
    attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.conversation.id': 'otel-1', 'gen_ai.usage.input_tokens': 80, 'gen_ai.usage.output_tokens': 20 } },
  { otelFormat: true, traceId: 'otel-1', spanId: 'tool-7', parentSpanId: 'req-9', kind: 'INTERNAL', name: 'execute_tool', startTime: 2_100_000, endTime: 2_150_000, durationMs: 50,
    attributes: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.call.id': 'tool-7', 'gen_ai.tool.name': 'run_tests', 'gen_ai.tool.call.arguments': { cmd: 'npm test' }, 'gen_ai.tool.call.result': '1 failed' },
    status: { code: 'ERROR', message: '1 failed' } },
  { otelFormat: true, traceId: 'otel-1', spanId: 'trailer-otel-1', kind: 'INTERNAL', name: 'session-trailer', startTime: 4_000_000, durationMs: 4000, isTrailer: true,
    attributes: { 'gen_ai.conversation.id': 'otel-1', 'agentscope.session.outcome': 'done' } },
]

function writeOtel(name: string, rows: unknown[]): string {
  const file = join(traceDir, `${name}.jsonl`)
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n'), 'utf8')
  return file
}

describe('OTel trace 消费', () => {
  it('inspectTrace：format=otel、完整 trailer、hash 为原始字节', () => {
    writeOtel('otel-1', OTEL_ROWS)
    const inspected = inspectTrace('otel-1', { tracesDir: traceDir })
    expect(inspected.ok).toBe(true)
    expect(inspected.format).toBe('otel')
    expect(inspected.complete).toBe(true)
    expect(inspected.traceHash).toMatch(/^[a-f0-9]{64}$/)
    // rows 已转 legacy 投影：header/session_id 齐
    expect(inspected.rows?.some((r) => r.type === 'header' && r.session_id === 'otel-1')).toBe(true)
  })

  it('sampleFromTrace：OTel 转换后出工具序列与 token 证据', () => {
    writeOtel('otel-1', OTEL_ROWS)
    const r = sampleFromTrace('otel-1', { tracesDir: traceDir })
    expect(r.ok).toBe(true)
    expect(r.sample?.toolCalls).toEqual([{ name: 'run_tests', ok: false, durationMs: 50 }])
    expect(r.sample?.efficiency).toMatchObject({ tokens: 100, steps: 1, durationMs: 4000 })
    expect(r.meta).toMatchObject({ format: 'otel', complete: true })
  })

  it('span 级：OTel 的 gen_ai.tool.call.id 可作 spanRef 命中', () => {
    writeOtel('otel-1', OTEL_ROWS)
    const r = sampleSpanFromTrace('otel-1', 'tool-7', { tracesDir: traceDir })
    expect(r.ok).toBe(true)
    expect(r.spanKind).toBe('tool_span')
    expect(r.sample?.toolCalls?.[0]).toMatchObject({ name: 'run_tests', ok: false })
  })

  it('缺 trailer 的 OTel 文件 complete=false（会话仍在写）', () => {
    writeOtel('otel-2', OTEL_ROWS.slice(0, -1))
    const inspected = inspectTrace('otel-2', { tracesDir: traceDir })
    expect(inspected.format).toBe('otel')
    expect(inspected.complete).toBe(false)
  })

  it('无 otelFormat 标志的裸 spanId 行不判 OTel（与 controllers 严格谓词一致，防两处判定打架）', () => {
    writeOtel('edge-1', [{ traceId: 'x', spanId: 'y', kind: 'INTERNAL', startTime: 1 }])
    const inspected = inspectTrace('edge-1', { tracesDir: traceDir })
    expect(inspected.format).toBe('unknown')
  })

  it('OTel 轨迹可转回归题（hash 仍为原始字节）并可按 origin 复判', async () => {
    writeOtel('otel-1', OTEL_ROWS)
    const preview = sampleFromTrace('otel-1', { tracesDir: traceDir })
    expect(preview.ok).toBe(true)
    const reflowed = reflowTraceToSet({
      sessionId: 'otel-1',
      expectedTraceHash: preview.meta!.traceHash!,
      task: {
        problem: 'OTel 生产会话测试失败',
        expectedBehavior: '测试通过',
        rubric: [{ id: 'a1', text: '包含 FIXED', expect: 'yes', kind: 'trajectory', s0: { kind: 'regex', pattern: 'FIXED' } }],
      },
    }, { tracesDir: traceDir })
    expect(reflowed.ok).toBe(true)
    if (!reflowed.ok) return

    const { runReplayEval, loadEvalConfig } = await import('../index')
    const run = await runReplayEval({ setId: reflowed.set.id, samples: {}, useOrigin: true }, {
      judge: { config: loadEvalConfig() },
      outcomeCtx: { runStartedAt: Date.now() },
    })
    expect(run.ok).toBe(true)
    if (!run.ok) return
    expect(run.run.evidenceMode).toBe('origin')
    expect(run.run.attempts[0]).toMatchObject({ sessionId: 'otel-1', passed: false })
    expect(run.run.attempts[0].toolCalls?.[0]).toMatchObject({ name: 'run_tests' })
  })
})
