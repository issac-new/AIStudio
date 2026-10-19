// span 级采样守门（2026-10-19 观测层轮）：LLM span（pre/post/reasoning/子工具）
// 与工具 span 的 Evidence 构造、缺 span/非法参数降级。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sampleSpanFromTrace } from '../trace-sampler'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'span-sampler-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeTrace(sessionId: string, lines: unknown[]): void {
  writeFileSync(join(dir, `${sessionId}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8')
}

const TRACE = [
  { type: 'header', session_id: 's1', started_at: 1000 },
  { type: 'chunk', kind: 'llm_span', phase: 'pre', api_request_id: 'req-1', model: 'glm-5', started_at: 1001, request_messages: [{ role: 'user', content: '写一个排序函数' }] },
  { type: 'chunk', kind: 'llm_span', phase: 'post', api_request_id: 'req-1', model: 'glm-5', started_at: 1001, ended_at: 1006, duration_ms: 5000, first_token_ms: 800, usage: { input_tokens: 120, output_tokens: 60 }, response_preview: 'def sort(xs): ...', reasoning_preview: '先想快排还是归并' },
  { type: 'chunk', kind: 'tool_span', tool_call_id: 'tc-1', api_request_id: 'req-1', tool_name: 'write_file', status: 'ok', duration_ms: 30, args: { path: '/a.py' } },
  { type: 'chunk', kind: 'tool_span', tool_call_id: 'tc-2', api_request_id: 'req-1', tool_name: 'run_tests', status: 'error', error_message: '1 failed', duration_ms: 200, args: { cmd: 'pytest' } },
  { type: 'chunk', kind: 'llm_span', phase: 'pre', api_request_id: 'req-2', model: 'glm-5', started_at: 1010, request_messages: [{ role: 'user', content: '换个问法' }] },
  { type: 'chunk', kind: 'llm_span', phase: 'error', api_request_id: 'req-2', model: 'glm-5', started_at: 1010, ended_at: 1011, status_code: 429, error_type: 'rate_limit', error_message: 'too many' },
  { type: 'trailer', session_id: 's1', duration_ms: 11000 },
]

describe('sampleSpanFromTrace', () => {
  beforeEach(() => {
    writeTrace('s1', TRACE)
  })

  it('LLM span：请求/响应/reasoning/子工具序列/tokens/TTFT 全入证', () => {
    const r = sampleSpanFromTrace('s1', 'req-1', { tracesDir: dir })
    expect(r.ok).toBe(true)
    expect(r.spanKind).toBe('llm_span')
    expect(r.sample?.transcript).toContain('[request]')
    expect(r.sample?.transcript).toContain('写一个排序函数')
    expect(r.sample?.transcript).toContain('[response]')
    expect(r.sample?.transcript).toContain('def sort')
    expect(r.sample?.transcript).toContain('[reasoning]')
    expect(r.sample?.transcript).toContain('先想快排')
    expect(r.sample?.toolCalls).toEqual([
      { name: 'write_file', ok: true, durationMs: 30 },
      { name: 'run_tests', ok: false, durationMs: 200 },
    ])
    expect(r.sample?.efficiency).toMatchObject({ tokens: 180, steps: 2, durationMs: 5000, ttftMs: 800 })
    expect(r.meta).toMatchObject({ spanRef: 'req-1', tokens: 180, childToolCalls: 2 })
  })

  it('LLM error span：error 段入证，429 现场保留', () => {
    const r = sampleSpanFromTrace('s1', 'req-2', { tracesDir: dir })
    expect(r.ok).toBe(true)
    expect(r.sample?.transcript).toContain('[error]')
    expect(r.sample?.transcript).toContain('rate_limit')
  })

  it('工具 span：tool_call_id 直匹，单工具成证', () => {
    const r = sampleSpanFromTrace('s1', 'tc-2', { tracesDir: dir })
    expect(r.ok).toBe(true)
    expect(r.spanKind).toBe('tool_span')
    expect(r.sample?.toolCalls).toEqual([{ name: 'run_tests', ok: false, durationMs: 200 }])
    expect(r.sample?.transcript).toContain('run_tests')
    expect(r.sample?.transcript).toContain('1 failed')
  })

  it('span 不存在/非法参数/缺文件如实降级', () => {
    expect(sampleSpanFromTrace('s1', 'req-999', { tracesDir: dir })).toMatchObject({ ok: false })
    expect(sampleSpanFromTrace('../etc', 'req-1', { tracesDir: dir })).toMatchObject({ ok: false })
    expect(sampleSpanFromTrace('s1', '../../x', { tracesDir: dir })).toMatchObject({ ok: false })
    expect(sampleSpanFromTrace('nope', 'req-1', { tracesDir: dir })).toMatchObject({ ok: false, reason: 'trace 不存在' })
  })
})
