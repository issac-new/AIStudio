// 观测信号采集守门（2026-10-19 观测层轮）：窗口过滤/OTel 跳过/坏行容错/
// 目录缺席降级/mtime 预筛。
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectObsSignals, collectTraceRows } from '../collect'

let dir: string
const NOW = 1_760_100_000_000 // ms
const NOW_S = NOW / 1000

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'obssignals-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeJsonl(name: string, lines: unknown[]): string {
  const file = join(dir, name)
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8')
  return file
}

describe('collectTraceRows', () => {
  it('窗口内 legacy 行全量采集；OTel 行经单一事实源转换后同样入聚（不再跳过）', () => {
    writeJsonl('s1.jsonl', [
      { type: 'header', session_id: 's1', started_at: NOW_S - 3600 },
      { type: 'chunk', kind: 'llm_span', phase: 'post', session_id: 's1', started_at: NOW_S - 3000, ended_at: NOW_S - 2990 },
    ])
    // OTel 文件：根 span（→header）+ chat span（→llm_span post，带 usage）
    writeJsonl('s2.jsonl', [
      { traceId: 's2', spanId: 'session-s2', otelFormat: true, kind: 'SERVER', name: 'invoke_agent', startTime: (NOW_S - 3600) * 1e6,
        attributes: { 'gen_ai.operation.name': 'invoke_agent', 'gen_ai.conversation.id': 's2', 'gen_ai.request.model': 'glm-5' } },
      { traceId: 's2', spanId: 'req-1', otelFormat: true, kind: 'CLIENT', name: 'chat', parentSpanId: 'session-s2',
        startTime: (NOW_S - 3000) * 1e6, endTime: (NOW_S - 2990) * 1e6, durationMs: 10_000,
        attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.conversation.id': 's2', 'gen_ai.usage.input_tokens': 30, 'gen_ai.usage.output_tokens': 6 } },
    ])
    const r = collectTraceRows(7, { dir, now: NOW })
    expect(r.files).toBe(2)
    expect(r.skippedOtelFiles).toBe(0)
    // OTel 两行都进聚合：header 行 + 转换出的 llm_span post 行
    const llmPost = r.rows.filter((x) => x.kind === 'llm_span' && (x.phase === 'post' || x.ended_at))
    expect(llmPost.length).toBe(2)
    const otelChat = r.rows.find((x) => (x.session_id ?? '') === 's2' && x.usage)
    expect(otelChat?.usage).toMatchObject({ input_tokens: 30, output_tokens: 6 })
  })

  it('OTel 端到端聚合：转换后进 buildObsSignals 计数（llmCalls/tokens 不再是盲区）', () => {
    writeJsonl('otel-only.jsonl', [
      { traceId: 's9', spanId: 'session-s9', otelFormat: true, kind: 'SERVER', name: 'invoke_agent', startTime: (NOW_S - 3600) * 1e6,
        attributes: { 'gen_ai.operation.name': 'invoke_agent', 'gen_ai.conversation.id': 's9' } },
      { traceId: 's9', spanId: 'req-9', otelFormat: true, kind: 'CLIENT', name: 'chat', parentSpanId: 'session-s9',
        startTime: (NOW_S - 3000) * 1e6, endTime: (NOW_S - 2995) * 1e6, durationMs: 5000,
        attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.conversation.id': 's9', 'gen_ai.usage.input_tokens': 100, 'gen_ai.usage.output_tokens': 20 } },
    ])
    const r = collectObsSignals(7, { dir, now: NOW })
    expect(r.report.available).toBe(true)
    expect(r.report.totals.llmCalls).toBe(1)
    expect(r.report.totals.tokens.input).toBe(100)
    expect(r.skippedOtelFiles).toBe(0)
  })

  it('超窗行（时间戳老于 cutoff）被精滤；mtime 老的文件整跳', () => {
    const recent = writeJsonl('s1.jsonl', [
      { type: 'chunk', kind: 'llm_span', phase: 'post', started_at: NOW_S - 100, ended_at: NOW_S - 90 },
      { type: 'chunk', kind: 'llm_span', phase: 'post', started_at: NOW_S - 9 * 86_400, ended_at: NOW_S - 9 * 86_400 + 10 },
    ])
    void recent
    const old = writeJsonl('s2.jsonl', [
      { type: 'chunk', kind: 'llm_span', phase: 'post', started_at: NOW_S - 100, ended_at: NOW_S - 90 },
    ])
    const oldTime = (NOW - 30 * 86_400_000) / 1000
    utimesSync(old, oldTime, oldTime)
    const r = collectTraceRows(7, { dir, now: NOW })
    expect(r.rows.length).toBe(1)
    expect(r.files).toBe(1)
  })

  it('坏行跳过、目录缺席 notes 降级', () => {
    writeFileSync(join(dir, 's1.jsonl'), 'not-json\n' + JSON.stringify({ type: 'chunk', kind: 'tool_span', started_at: NOW_S - 50 }), 'utf8')
    const r = collectTraceRows(7, { dir, now: NOW })
    expect(r.rows.length).toBe(1)
    const missing = collectTraceRows(7, { dir: join(dir, 'nope'), now: NOW })
    expect(missing.rows).toEqual([])
    expect(missing.notes.join(' ')).toContain('缺席')
  })
})

describe('collectObsSignals', () => {
  it('端到端：文件 → 聚合报告 + sources 计数', () => {
    writeJsonl('s1.jsonl', [
      { type: 'header', session_id: 's1', started_at: NOW_S - 3600 },
      { type: 'chunk', kind: 'llm_span', phase: 'post', session_id: 's1', model: 'glm-5', started_at: NOW_S - 3000, ended_at: NOW_S - 2995, duration_ms: 5000, first_token_ms: 700, usage: { input_tokens: 42, output_tokens: 8 } },
    ])
    const r = collectObsSignals(7, { dir, now: NOW })
    expect(r.report.available).toBe(true)
    expect(r.report.totals.llmCalls).toBe(1)
    expect(r.report.totals.ttftMs.p95).toBe(700)
    expect(r.files).toBe(1)
    expect(r.rows).toBe(2)
  })
})
