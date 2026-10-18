// 真实轨迹采样（残余项④）守门：工具序列、token、脱敏、缺文件/非法 id 降级。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sampleFromTrace } from '../trace-sampler'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trace-sampler-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeTrace(sessionId: string, lines: unknown[]): void {
  writeFileSync(join(dir, `${sessionId}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8')
}

describe('sampleFromTrace', () => {
  it('汇总工具序列、tokens、steps、duration，并对参数脱敏', () => {
    writeTrace('s1', [
      { type: 'header', session_id: 's1', started_at: 1000 },
      { type: 'chunk', kind: 'llm_span', usage: { input_tokens: 100, output_tokens: 20 } },
      { type: 'chunk', kind: 'tool_span', tool_name: 'read_file', status: 'ok', duration_ms: 12, args: { path: '/a', apiKey: 'sk-secret' } },
      { type: 'chunk', kind: 'tool_span', tool_name: 'terminal_exec', status: 'error', error_message: 'boom', args: { command: 'ls' } },
      { type: 'trailer', session_id: 's1', duration_ms: 5000 },
    ])
    const r = sampleFromTrace('s1', { tracesDir: dir })
    expect(r.ok).toBe(true)
    expect(r.sample?.toolCalls).toEqual([
      { name: 'read_file', ok: true, durationMs: 12 },
      { name: 'terminal_exec', ok: false, durationMs: undefined },
    ])
    expect(r.sample?.efficiency).toMatchObject({ tokens: 120, steps: 2, durationMs: 5000 })
    expect(r.sample?.transcript).toContain('tool: read_file')
    expect(r.sample?.transcript).not.toContain('sk-secret')
    expect(r.meta).toMatchObject({ lines: 5, toolCalls: 2, tokens: 120 })
  })

  it('缺 trace → ok=false；非法 sessionId 拒绝', () => {
    expect(sampleFromTrace('nope', { tracesDir: dir })).toMatchObject({ ok: false, reason: 'trace 不存在' })
    expect(sampleFromTrace('../etc/passwd', { tracesDir: dir })).toMatchObject({ ok: false })
  })

  it('坏行跳过，不阻断其余轨迹', () => {
    writeFileSync(join(dir, 's2.jsonl'), 'not-json\n' + JSON.stringify({ type: 'chunk', kind: 'llm_span', usage: { input_tokens: 5, output_tokens: 1 } }), 'utf8')
    const r = sampleFromTrace('s2', { tracesDir: dir })
    expect(r.ok).toBe(true)
    expect(r.sample?.efficiency?.tokens).toBe(6)
  })
})
