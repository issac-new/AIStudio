// trace 窗口聚合守门（2026-10-17 A7 数据面：hermes 会话文件名=时间戳，RUN_ID 查文件名永远 miss）
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTraceSummary } from '../incident-sources'

const DIR = mkdtempSync(join(tmpdir(), 'trace-win-'))
// 窗内文件（run20 窗口 1791969313-1792172511）：header + llm_span + tool_span
writeFileSync(join(DIR, '20261015_093012_aa11.jsonl'), [
  JSON.stringify({ type: 'header', session_id: '20261015_093012_aa11', started_at: 1791969400, model: 'glm', source: 'hermes-agent' }),
  JSON.stringify({ type: 'chunk', kind: 'llm_span', session_id: '20261015_093012_aa11', api_request_id: 'r1', usage: { input_tokens: 120, output_tokens: 8 } }),
  JSON.stringify({ type: 'chunk', kind: 'tool_span', session_id: '20261015_093012_aa11', tool_call_id: 't1', tool_name: 'terminal', status: 'ok', duration_ms: 42 }),
].join('\n') + '\n')
// 窗外文件（应被聚合排除）
writeFileSync(join(DIR, '20260101_000000_zz.jsonl'), JSON.stringify({ type: 'header', started_at: 1767225600 }) + '\n')

afterAll(() => rmSync(DIR, { recursive: true, force: true }))

describe('readTraceSummary 窗口聚合（A7）', () => {
  it('RUN_ID 查文件名 miss + 窗口命中时间戳文件 → 聚合 span', () => {
    const s = readTraceSummary(DIR, '20261015-v8-run20', { sinceSec: 1791969313, untilSec: 1792172511 })
    expect(s).not.toBeNull()
    expect(s!.llmCalls).toBe(1)
    expect(s!.toolCalls.map((t) => t.name)).toContain('terminal')
    expect(s!.inputTokens).toBe(120)
  })
  it('窗口外文件排除（窗外 header 不入聚合）', () => {
    const s = readTraceSummary(DIR, '20261015-v8-run20', { sinceSec: 1791969313, untilSec: 1792172511 })
    expect(s!.file).not.toContain('20260101')
  })
  it('无窗口且无精确文件名 → null（旧行为保持）', () => {
    expect(readTraceSummary(DIR, '20261015-v8-run20')).toBeNull()
  })
  it('精确文件名命中仍优先生效', () => {
    writeFileSync(join(DIR, 'exact.jsonl'), JSON.stringify({ type: 'header', started_at: 0 }) + '\n')
    const s = readTraceSummary(DIR, 'exact')
    expect(s).not.toBeNull()
  })
})
