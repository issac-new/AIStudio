// 多源导入适配面守门（#22：三源解析/坏行跳过计数/统一行格式）。
import { describe, it, expect } from 'vitest'
import { parseSessionHistory } from '../session-importer'

describe('三源导入（codex/kimi/claude→统一行）', () => {
  it('codex jsonl：message 型+content 数组拼接', () => {
    const imp = parseSessionHistory('codex', 'sess-c1', [
      '{"type":"message","role":"user","content":[{"type":"input_text","text":"hi "},{"type":"input_text","text":"there"}],"timestamp":100}',
      '{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}',
      'not-json',
    ])
    expect(imp.rows).toHaveLength(2)
    expect(imp.rows[0]).toMatchObject({ role: 'user', text: 'hi there', at: 100 })
    expect(imp.skippedRows).toBe(1)
  })

  it('kimi：role/content 字符串或 parts；claude：type/message.content', () => {
    const kimi = parseSessionHistory('kimi', 'sess-k1', [
      '{"role":"user","content":"hello"}',
      '{"role":"assistant","content":[{"text":"part1"},{"text":"part2"}]}',
    ])
    expect(kimi.rows.map((r) => r.text)).toEqual(['hello', 'part1part2'])

    const claude = parseSessionHistory('claude', 'sess-cl1', [
      '{"type":"user","message":{"content":"q"}}',
      '{"type":"assistant","message":{"content":[{"text":"a"}]}}',
      '{"type":"unknown","message":{"content":"x"}}',
    ])
    expect(claude.rows).toHaveLength(2)
    expect(claude.rows[1]).toMatchObject({ role: 'assistant', text: 'a' })
    expect(claude.skippedRows).toBe(1)
  })

  it('空文本行跳过；统一行带来源标记', () => {
    const imp = parseSessionHistory('kimi', 'sess-x', [
      '{"role":"user","content":""}', '{"role":"weird","content":"t"}',
    ])
    expect(imp.rows).toEqual([])
    expect(imp.skippedRows).toBe(2)
    const ok = parseSessionHistory('codex', 'id9', ['{"type":"message","role":"tool","content":"r"}'])
    expect(ok.rows[0]).toMatchObject({ source: 'codex', sourceId: 'id9', role: 'tool' })
  })
})
